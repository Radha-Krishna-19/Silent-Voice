"""Train the 1-D CNN baseline. Writes models/cnn.pt.

This is the control model for the BiLSTM comparison — same data, same split,
same training loop, same augmentation. Only the architecture changes.
"""
from _train import cli

if __name__ == "__main__":
    cli(default_name="cnn", out_name="cnn")
