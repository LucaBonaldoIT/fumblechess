"""Export a trained ChessNet checkpoint to ONNX and verify the export against PyTorch.

  .venv/bin/python export.py --ckpt checkpoints/level1.pt --out ../public/models/level1.onnx

By default the weights are stored in fp16 (half the download). Compute stays fp32: every fp16 weight is cast back to
fp32 when the model loads, because onnxruntime-web's WebAssembly backend has no fp16 kernels. Use --fp32 to skip.
"""
import argparse

import chess
import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnx import TensorProto, helper, numpy_helper

from encode import encode_board
from model import ChessNet, Config


def compress_weights_fp16(path: str, min_elements: int = 16) -> tuple[int, int]:
    """Store float32 initializers as fp16 + a Cast back to fp32. Returns (tensors converted, max |rounding error|)."""
    model = onnx.load(path)
    graph = model.graph
    graph_inputs = {i.name for i in graph.input}
    kept, casts, converted, worst = [], [], 0, 0.0
    for init in graph.initializer:
        if init.data_type != TensorProto.FLOAT or int(np.prod(init.dims)) < min_elements or init.name in graph_inputs:
            kept.append(init)
            continue
        arr = numpy_helper.to_array(init)
        half = arr.astype(np.float16)
        if not np.isfinite(half).all():
            kept.append(init)  # would overflow fp16: keep exact
            continue
        worst = max(worst, float(np.abs(arr - half.astype(np.float32)).max()))
        kept.append(numpy_helper.from_array(half, name=init.name + "_fp16"))
        casts.append(helper.make_node("Cast", [init.name + "_fp16"], [init.name], to=TensorProto.FLOAT, name=init.name + "_cast"))
        converted += 1
    nodes = list(graph.node)
    del graph.initializer[:]
    graph.initializer.extend(kept)
    del graph.node[:]
    graph.node.extend(casts + nodes)  # casts first, so every consumer sees its fp32 weight
    onnx.checker.check_model(model)
    onnx.save(model, path)
    return converted, worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--out", required=True, help="e.g. ../public/models/level1.onnx")
    ap.add_argument("--fp32", action="store_true", help="keep fp32 weights (about twice the size)")
    args = ap.parse_args()

    ck = torch.load(args.ckpt, map_location="cpu")
    model = ChessNet(Config(**ck["cfg"]))
    model.load_state_dict(ck["state"])
    model.eval()

    dummy = torch.from_numpy(encode_board(chess.Board())).unsqueeze(0)
    torch.onnx.export(
        model,
        (dummy,),
        args.out,
        input_names=["board"],
        output_names=["policy", "value"],
        dynamic_axes={"board": {0: "batch"}, "policy": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    if not args.fp32:
        n, err = compress_weights_fp16(args.out)
        print(f"fp16 weights: {n} tensors, max rounding error {err:.2e}")

    sess = ort.InferenceSession(args.out)
    with torch.no_grad():
        ref_p, ref_v = model(dummy)
    got_p, got_v = sess.run(None, {"board": dummy.numpy()})
    print("max policy diff", np.abs(ref_p.numpy() - got_p).max())
    print("max value diff ", np.abs(ref_v.numpy() - got_v).max())
    print("wrote", args.out)


if __name__ == "__main__":
    main()
