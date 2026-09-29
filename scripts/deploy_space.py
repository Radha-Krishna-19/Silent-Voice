r"""Deploy the backend to a free Hugging Face Space, so the GitHub Pages site
has a server to talk to.

One-time: create a free account at huggingface.co, then log in from a
terminal (you paste your own access token; this script never sees it):

    nndl\Scripts\hf.exe auth login

Then, from the project root:

    nndl\Scripts\python.exe scripts\deploy_space.py

It creates the Space if needed, uploads backend/ + ml/scripts + ml/logs +
the trained checkpoints, and sets CORS so the Pages site may call it. The
Space then builds its Docker image (~5-10 minutes the first time).
"""
import argparse
import shutil
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
PAGES_ORIGIN = "https://radha-krishna-19.github.io"

# Not needed to serve: local database, caches, tests, secrets, the untrimmed
# sign bank.
SKIP = shutil.ignore_patterns(
    "__pycache__", "*.pyc", "data", ".env", ".env.*", "test_*.py",
    "requirements-test.txt", "Dockerfile", "*.pretrim", ".gitkeep",
)


def stage(dst: Path) -> None:
    shutil.copytree(ROOT / "backend", dst / "backend", ignore=SKIP)
    shutil.copytree(ROOT / "ml" / "scripts", dst / "ml" / "scripts", ignore=SKIP)
    shutil.copytree(ROOT / "ml" / "logs", dst / "ml" / "logs", ignore=SKIP)
    for f in ("Dockerfile", "README.md"):
        shutil.copy2(ROOT / "deploy" / "hf-space" / f, dst / f)

    missing = [m for m in ("bilstm.pt", "cnn.pt", "label_map.json", "sign_bank.json",
                           "practice_refs.npz") if not (dst / "backend" / "models" / m).exists()]
    if missing:
        raise SystemExit(f"backend/models is missing {missing} - train or restore them first")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="silent-voice", help="Space name (default: silent-voice)")
    args = ap.parse_args()

    api = HfApi()
    user = api.whoami()["name"]          # fails clearly if not logged in
    repo_id = f"{user}/{args.name}"

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)
    api.add_space_variable(repo_id, "CORS_ORIGINS",
                           f"{PAGES_ORIGIN},http://localhost:3000,http://127.0.0.1:3000")

    with tempfile.TemporaryDirectory() as tmp:
        stage(Path(tmp))
        api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=tmp,
                          commit_message="Deploy Silent Voice backend",
                          delete_patterns=["backend/**", "ml/**"])

    url = f"https://{user}-{args.name}".lower().replace("_", "-") + ".hf.space"
    print(f"\nSpace : https://huggingface.co/spaces/{repo_id}")
    print(f"API   : {url}")
    print("\nThe Space is now building (first build ~5-10 min).")
    print("Point GitHub Pages at it with:")
    print(f"  gh variable set BACKEND_URL --body {url}")


if __name__ == "__main__":
    main()
