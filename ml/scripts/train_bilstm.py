"""Train the BiLSTM classifier. Writes models/bilstm.pt."""
from _train import cli

if __name__ == "__main__":
    cli(default_name="bilstm", out_name="bilstm")
