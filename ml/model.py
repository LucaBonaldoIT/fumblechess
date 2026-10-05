"""ChessNet: square encoder -> local chess mixer -> transformer -> policy + value heads."""
import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F

from encode import N_FEATURES


@dataclass
class Config:
    d_model: int = 256  # 256-512
    n_layers: int = 8  # 8-12
    n_heads: int = 8
    n_mixer: int = 2
    mlp_ratio: int = 4


class SquareEncoder(nn.Module):
    """Per-square features -> d_model token, plus learned square embedding."""

    def __init__(self, cfg: Config):
        super().__init__()
        self.proj = nn.Linear(N_FEATURES, cfg.d_model)
        self.pos = nn.Parameter(torch.zeros(64, cfg.d_model))
        nn.init.normal_(self.pos, std=0.02)
        self.norm = nn.LayerNorm(cfg.d_model)

    def forward(self, x):  # [B,64,F]
        return self.norm(self.proj(x) + self.pos)


class MixerBlock(nn.Module):
    """Depthwise 3x3 conv (spatial mixing on the 8x8 grid) + pointwise MLP, residual."""

    def __init__(self, d: int):
        super().__init__()
        self.dw = nn.Conv2d(d, d, 3, padding=1, groups=d)
        self.bn1 = nn.BatchNorm2d(d)
        self.pw1 = nn.Conv2d(d, d * 2, 1)
        self.pw2 = nn.Conv2d(d * 2, d, 1)
        self.bn2 = nn.BatchNorm2d(d)

    def forward(self, x):  # [B,d,8,8]
        x = x + self.bn1(F.gelu(self.dw(x)))
        x = x + self.bn2(self.pw2(F.gelu(self.pw1(x))))
        return x


class LocalChessMixer(nn.Module):
    def __init__(self, cfg: Config):
        super().__init__()
        self.blocks = nn.Sequential(*[MixerBlock(cfg.d_model) for _ in range(cfg.n_mixer)])

    def forward(self, x):  # [B,64,d]
        B, _, d = x.shape
        g = x.transpose(1, 2).reshape(B, d, 8, 8)  # square = rank*8+file -> (rank, file)
        g = self.blocks(g)
        return g.reshape(B, d, 64).transpose(1, 2)


class Attention(nn.Module):
    # Manual attention (no fused/SDPA op) so the ONNX graph stays plain for onnxruntime-web.
    def __init__(self, d: int, heads: int):
        super().__init__()
        self.h, self.dh = heads, d // heads
        self.qkv = nn.Linear(d, 3 * d)
        self.out = nn.Linear(d, d)

    def forward(self, x):
        B, T, d = x.shape
        q, k, v = self.qkv(x).reshape(B, T, 3, self.h, self.dh).permute(2, 0, 3, 1, 4)
        att = torch.softmax(q @ k.transpose(-1, -2) / math.sqrt(self.dh), dim=-1)
        return self.out((att @ v).transpose(1, 2).reshape(B, T, d))


class TransformerBlock(nn.Module):
    def __init__(self, cfg: Config):
        super().__init__()
        d = cfg.d_model
        self.n1 = nn.LayerNorm(d)
        self.attn = Attention(d, cfg.n_heads)
        self.n2 = nn.LayerNorm(d)
        self.mlp = nn.Sequential(nn.Linear(d, d * cfg.mlp_ratio), nn.GELU(), nn.Linear(d * cfg.mlp_ratio, d))

    def forward(self, x):
        x = x + self.attn(self.n1(x))
        return x + self.mlp(self.n2(x))


class PolicyHead(nn.Module):
    """From/to bilinear scores over squares -> 4096 move logits."""

    def __init__(self, d: int):
        super().__init__()
        self.norm = nn.LayerNorm(d)
        self.q = nn.Linear(d, d)
        self.k = nn.Linear(d, d)
        self.d = d

    def forward(self, x):
        x = self.norm(x)
        logits = self.q(x) @ self.k(x).transpose(1, 2) / math.sqrt(self.d)  # [B,from,to]
        return logits.reshape(x.shape[0], 64 * 64)


class ValueHead(nn.Module):
    """Pooled tokens -> win/draw/loss logits (white's perspective)."""

    def __init__(self, d: int):
        super().__init__()
        self.norm = nn.LayerNorm(d)
        self.mlp = nn.Sequential(nn.Linear(d, d), nn.GELU(), nn.Linear(d, 3))

    def forward(self, x):
        return self.mlp(self.norm(x).mean(dim=1))


class ChessNet(nn.Module):
    def __init__(self, cfg: Config = Config()):
        super().__init__()
        self.cfg = cfg
        self.encoder = SquareEncoder(cfg)
        self.mixer = LocalChessMixer(cfg)
        self.blocks = nn.Sequential(*[TransformerBlock(cfg) for _ in range(cfg.n_layers)])
        self.final_norm = nn.LayerNorm(cfg.d_model)
        self.policy = PolicyHead(cfg.d_model)
        self.value = ValueHead(cfg.d_model)

    def forward(self, board):  # [B,64,N_FEATURES] -> (policy logits [B,4096], wdl logits [B,3])
        h = self.encoder(board)
        h = self.mixer(h)
        h = self.final_norm(self.blocks(h))
        return self.policy(h), self.value(h)
