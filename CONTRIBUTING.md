# Contributing to AI Organization OS

Thank you for helping build a transparent and permissioned operating layer for AI-native organizations.

## Before contributing

- Read [`AGENTS.md`](AGENTS.md) for the repository operating contract.
- Read [`docs/PRODUCT.md`](docs/PRODUCT.md) for the stable product definition.
- Review [`docs/PRODUCT_DISCOVERY.md`](docs/PRODUCT_DISCOVERY.md) before proposing a change to the operating model.
- Do not include API keys, tokens, personal data, local filesystem paths, machine names, or runtime state in issues, commits, tests, screenshots, or pull requests.

## Local development

The MVP requires a current Node.js runtime and has no third-party application dependencies.

```bash
npm start
```

Open <http://localhost:3333/>. Runtime state is stored in the ignored `data/state.json` file.

Run the tests before submitting a change:

```bash
npm test
git diff --check
rg --hidden -n '[\p{Han}]' . -g '!.git/**' -g '!data/state.json' -g '!data/worktrees/**'
```

Public-facing UI, documentation, code comments, test descriptions, and commit messages must remain in English.

## Contribution workflow

1. Open or select an issue that describes the user problem, proposed outcome, and relevant safety boundary.
2. Create a focused branch from `main`.
3. Make the smallest coherent change and add proportionate tests.
4. Verify that completed tasks still require output and evidence.
5. Review the diff for secrets, personal information, local paths, and generated runtime data.
6. Open a pull request describing the change, verification performed, limitations, and any follow-up work.

Small documentation corrections may be submitted directly. Changes to permissions, external actions, secrets, execution isolation, or approval semantics require explicit security reasoning in the pull request.

## Product and architecture proposals

For a material product change, describe:

- the Founder or contributor problem;
- the expected behavior and non-goals;
- affected agents, assets, actions, and approval boundaries;
- evidence required to call the change complete;
- migration or compatibility risks;
- the smallest end-to-end validation.

The project favors observable workflows and enforceable controls over agent role-play. A model may propose an action, but authority must remain in the runtime policy and tool boundary.

## Reporting security issues

Do not publish credentials, exploitable details, or private data in a public issue. Use GitHub's private vulnerability reporting feature when it is available for the repository.

## License

By submitting a contribution, you agree that it may be distributed under the [Apache License 2.0](LICENSE).
