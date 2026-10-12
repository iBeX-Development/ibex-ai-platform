# Pinned foundation container

Both Dockerfile stages use `docker.io/library/node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`. CI also selects Node `22.23.3`, observed in successful [PR #33 CI run 38214435590](https://github.com/gt7719/ibex-ai-platform/actions/runs/38214435590). pnpm remains `11.19.0`, installation remains frozen, and the runtime remains `USER node`.

## Publisher identity verification

On 2026-10-12, read the exact tag from the [Docker Hub publisher registry](https://registry-1.docker.io/v2/library/node/manifests/22.23.3-alpine3.24), using anonymous pull authorization and OCI/Docker manifest Accept types. The raw index SHA-256 matched `Docker-Content-Digest`: `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402` (OCI image index). Fetching each child by digest confirmed its raw SHA-256, header digest and descriptor size. Each runnable platform's configuration blob was also hash-verified and declared `NODE_VERSION=22.23.3` and the matching architecture. No image layers were downloaded or executed locally.

| Linux platform | Runnable manifest SHA-256                                          | Attestation manifest SHA-256 (unknown/unknown, not executable)     |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| amd64          | `2c752226d477b4a886378baa95b9af252be59301b725fdb0b7e15208131505a8` | `19291780306d781c9f8ed7f4dabdaf2a3c69a77fdfed1154e3c44d8ba187005b` |
| arm/v6         | `099ba81786a642d2e5570f8a1825f4e932c94653273a3f2f5dcb42ea2d306435` | `aadfeb52300e90e2bc712b48eafffd7ea958a515cc017c7fb583742615b6068a` |
| arm/v7         | `38dd72a9bee3a91cc8e2d71268087100a8498fdfee219f173cb92a39bea07408` | `48a5d042ed44645ca03163d63a3432b56b6b1813b331401323480189be76697a` |
| arm64/v8       | `85cdd100016a2e09927c0776bb7ebebcfefce5cd0af49893ada91cbc4d78ee22` | `de9b939f1cbd1569a55f07223e20ef913f448bf0be409593b87d11e380c02ee8` |
| s390x          | `107048f9dab733710ce9cd53395ea7a1f7b019faba8243b2e02656acb94ce764` | `45aff9fd4cb2bb7e9fa1733f1785688343955db61ada99390ee1dd61b7e1cae4` |

The amd64 configuration digest is `sha256:7c3b093add7c43400ee83b815ab2cda98794a10045bcf76ce9bb2f89b97cbc5c`. The index's source annotations and the immutable [Docker Official Images library entry](https://github.com/docker-library/official-images/blob/57566432d7ebf353887333f6d2f16c11a70dae47/library/node) agree on `nodejs/docker-node` commit `81f419144a1251854c6d9afb09eaa39928e724e8`, directory `22/alpine3.24`, and all five architectures. Its [source Dockerfile](https://github.com/nodejs/docker-node/blob/81f419144a1251854c6d9afb09eaa39928e724e8/22/alpine3.24/Dockerfile) declares Node `22.23.3`, Alpine `3.24` and node UID/GID `1000`. These HTTPS publisher records and content hashes establish the selected artifact linkage; attestation payload/signature verification or an independently reproduced publisher build is not claimed.

To reverify, GET the index by its digest with OCI media types, hash the raw response bytes, then verify each descriptor and configuration blob the same way. Do not replace the digest with a newly resolved mutable tag without review. The [registry API](https://distribution.github.io/distribution/spec/api/) defines content-digest verification.

## Bounded hosted check

After every existing validation gate passes, the separate GitHub-hosted Linux job builds only `linux/amd64`, with a 600-second build command bound and a 15-minute job limit. It records Docker/buildx versions and the resulting local image ID; it never pushes an image. No Docker/VM installation or container execution occurs on the developer's Windows computer.

The two-minute smoke step creates a fresh container with synthetic development configuration, all eleven AI flags false, no credentials or service endpoints, no host-port publication, `--network none`, a read-only root, dropped capabilities and resource limits. A probe inside the container checks `/health` is HTTP 200 with `disabled`, checks Node `22.23.3`, Linux/amd64 and UID/GID `1000`, and verifies all configured capabilities are disabled. Readiness observation is bounded to 15 seconds, with a 30-second outer exec limit. This checks only the foundation health route, not AI or external adapters.

An always-run, two-minute cleanup step verifies the exact container ID, job ownership label and image ID, captures bounded logs, stops that container with a five-second grace, verifies it is no longer running, and removes only that container and the locally built image. Individual cleanup commands are timed; log failure does not skip cleanup. Failure or ambiguity fails CI; runner loss/cancellation can interrupt cleanup and must not be described as observed disposal. No broad prune, deployment or host port is used. Docker's [run controls](https://docs.docker.com/reference/cli/docker/container/run/) and [stop semantics](https://docs.docker.com/reference/cli/docker/container/stop/) apply only to this job-owned synthetic container.

## Limits

Pinning the multi-platform base index and Node version does not make the application image byte-reproducible: the GitHub runner, Docker/BuildKit, Corepack, build timestamps and package-registry availability are not fully frozen. Only amd64 is built/smoked; other platform manifests were inspected, not run. Alpine uses musl and the publisher's [architecture support limitations](https://github.com/nodejs/docker-node#supported-architectures) still apply. The image is not vulnerability-free merely because its digest is pinned; future security updates require a reviewed pin update. Existing scanner regex/format/exclusion limits remain documented in `scripts/README.md`. No deployment, registry authority, OE/R&D, D2, Shadow or governance authorization follows from this foundation check; F06 remains blocked on owner inputs and approvals.
