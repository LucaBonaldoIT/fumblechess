"""Train one level's policy/value network on human games from fetch_lichess.py.

  .venv/bin/python train.py --data data/level1.npz --out checkpoints/level1.pt

Policy target: the move the human played (illegal moves masked out). Value target: the game result as win/draw/loss.
"""
import argparse
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from encode import N_MOVES
from model import ChessNet, Config


def load(path: str):
    d = np.load(path)
    x = torch.from_numpy(d["x"])  # uint8 [N,64,22]; the last two (clock) features are stored x100
    mask = torch.from_numpy(np.unpackbits(d["mask"], axis=1)[:, :N_MOVES].astype(bool))
    return x, torch.from_numpy(d["move"].astype(np.int64)), mask, torch.from_numpy(d["wdl"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True, help="npz from fetch_lichess.py")
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=4e-4)
    ap.add_argument("--out", default="checkpoints/model.pt")
    args = ap.parse_args()

    random.seed(0)
    torch.manual_seed(0)
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    model = ChessNet(Config()).to(device)
    print(f"params: {sum(p.numel() for p in model.parameters()) / 1e6:.2f}M on {device}")

    x, move, mask, wdl = load(args.data)
    n = len(x)
    perm = torch.randperm(n)
    n_val = max(512, n // 20)
    val, train = perm[:n_val], perm[n_val:]
    print(f"{n} positions ({len(train)} train / {n_val} val)")

    def losses(idx):
        xb = x[idx].float()
        xb[..., 20:] /= 100  # halfmove clock and move number back to 0-1
        logits, v = model(xb.to(device))
        logits = logits.masked_fill(~mask[idx].to(device), -1e9)
        mb, vb = move[idx].to(device), wdl[idx].to(device)
        policy_loss = F.cross_entropy(logits, mb)
        value_loss = -(vb * F.log_softmax(v, dim=-1)).sum(-1).mean()
        top1 = (logits.argmax(-1) == mb).float().mean()
        return policy_loss, value_loss, top1

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.steps)
    for step in range(1, args.steps + 1):
        model.train()
        idx = train[torch.randint(0, len(train), (args.batch,))]
        policy_loss, value_loss, _ = losses(idx)
        loss = policy_loss + 0.5 * value_loss
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        if step % 50 == 0 or step == 1:
            model.eval()
            with torch.no_grad():
                vp, vv, top1 = losses(val[:512])
            print(
                f"step {step:5d}  train policy {policy_loss.item():.3f}  | val policy {vp.item():.3f} value {vv.item():.3f} top1 {top1.item():.1%}",
                flush=True,
            )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"cfg": model.cfg.__dict__, "state": {k: v.cpu() for k, v in model.state_dict().items()}}, out)
    print("saved", out)


if __name__ == "__main__":
    main()
