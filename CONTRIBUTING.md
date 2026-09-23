# Contributing

Use a branch and pull request for changes. Do not work directly on `main`. A pull request must identify the approved architecture requirements it implements, describe its security and tenant impact, and include `pnpm validate` results.

Do not change an approved architecture boundary through code alone. Record the affected document and required decision, obtain the architecture decision through the project process, then update the implementation and this repository's references.

Never commit real secrets. Review diffs for credentials and tenant data before opening a pull request.

Use conventional, focused commits. Keep provider dependencies behind Model Gateway and preserve modular boundaries. Architecture changes require a separately approved architecture decision before code changes.
