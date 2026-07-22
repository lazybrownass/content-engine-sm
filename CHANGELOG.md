# Changelog

## [1.3.0](https://github.com/lazybrownass/content-engine-sm/compare/v1.2.0...v1.3.0) (2026-07-22)


### Features

* **pipeline:** add orchestrator and Grill self-critique loop ([#14](https://github.com/lazybrownass/content-engine-sm/issues/14)) ([f1654eb](https://github.com/lazybrownass/content-engine-sm/commit/f1654ebe055ec2aa57548fd10687ef3ac4c6d722))
* **pipeline:** add PipelineRun/AiRun schema with RLS ([#11](https://github.com/lazybrownass/content-engine-sm/issues/11)) ([ec50280](https://github.com/lazybrownass/content-engine-sm/commit/ec5028015a75cdbab46b6875a85a8457643f224d))
* **pipeline:** extend model router with outline/draft/grill_review purposes ([#13](https://github.com/lazybrownass/content-engine-sm/issues/13)) ([c864b5c](https://github.com/lazybrownass/content-engine-sm/commit/c864b5c38344c8d09cb51043fae8538256d2226b))

## [1.2.0](https://github.com/lazybrownass/content-engine-sm/compare/v1.1.0...v1.2.0) (2026-07-22)


### Features

* **generate:** add /generate page with brand voice manager ([#10](https://github.com/lazybrownass/content-engine-sm/issues/10)) ([613261e](https://github.com/lazybrownass/content-engine-sm/commit/613261ee0917459f42be21e3e7a8ac750a143c07))
* **generation:** add prompt synthesis engine and brand voice CRUD ([#8](https://github.com/lazybrownass/content-engine-sm/issues/8)) ([870f07f](https://github.com/lazybrownass/content-engine-sm/commit/870f07f6cb86f23129cbbc9eec4009231f47e56e))
* **generation:** add streaming /api/generate route ([#9](https://github.com/lazybrownass/content-engine-sm/issues/9)) ([500b2d4](https://github.com/lazybrownass/content-engine-sm/commit/500b2d4c4751b9cc48531a16c2aa7a60f54e290d))
* **schema:** add BrandVoice model with RLS ([#6](https://github.com/lazybrownass/content-engine-sm/issues/6)) ([1182add](https://github.com/lazybrownass/content-engine-sm/commit/1182add03c1e49f97588c752a44cf673dd347cc3))

## [1.1.0](https://github.com/lazybrownass/content-engine-sm/compare/v1.0.0...v1.1.0) (2026-07-21)


### Features

* Add Brand Voice Generation Engine (Phase 3) ([#4](https://github.com/lazybrownass/content-engine-sm/issues/4)) ([cd8640a](https://github.com/lazybrownass/content-engine-sm/commit/cd8640a562b7b366586a2bf75da9f8f8286aa891))

## 1.0.0 (2026-07-16)


### Features

* **auth:** add Supabase session helpers and middleware auth gate ([92875c5](https://github.com/lazybrownass/content-engine-sm/commit/92875c5f2ef6dadd181e0f55cadc6e290a3487f6))
* **auth:** build login, forbidden, and dashboard shell pages ([8330232](https://github.com/lazybrownass/content-engine-sm/commit/833023218839055fcfe91b13085704c6b7dd2d63))
* install shadcn/ui and base primitives ([4e700da](https://github.com/lazybrownass/content-engine-sm/commit/4e700daf6c66056164d44009572d5f07f228ba8b))
* local Docker stack, CI/CD, and release automation ([b8b8816](https://github.com/lazybrownass/content-engine-sm/commit/b8b8816a0a800ec4b975236df24f8ec4cc81d307))
* replace Supabase CLI local stack with docker-compose ([fcc206f](https://github.com/lazybrownass/content-engine-sm/commit/fcc206f877b8e6539b2b603f8f1077e04fecc35d))
* scaffold Prisma with User and Settings models ([b3bb800](https://github.com/lazybrownass/content-engine-sm/commit/b3bb800e4e8f1738e713bad8a741b58d8118702d))


### Bug Fixes

* align dependency-review severity threshold with security-scan ([55c7bce](https://github.com/lazybrownass/content-engine-sm/commit/55c7bce35978c223b25a18206491c8570984fd37))
* fix CI/build portability issues in schema and tsconfig ([97c707f](https://github.com/lazybrownass/content-engine-sm/commit/97c707fd89ae9817063285d9ae89b6334b371965))
* grant release-please job write permissions ([81266a2](https://github.com/lazybrownass/content-engine-sm/commit/81266a2dc7936c1b312d15d9af95ce3f9f1dafb0))
* grant release-please job write permissions ([603e1f3](https://github.com/lazybrownass/content-engine-sm/commit/603e1f3807407d70dc3625c7103049210c7f4f9a))
