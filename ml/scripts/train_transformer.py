"""Train the Transformer encoder. Writes models/transformer.pt."""
from _train import cli

if __name__ == "__main__":
    cli(default_name="transformer", out_name="transformer")
