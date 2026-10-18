# Self-hosted fonts

Unmodified WOFF2 subsets from the exact Fontsource variable packages below. Each family retains its original SIL Open
Font License in this directory. `assets.json` records file sizes and SHA-256 hashes. No external runtime font request is used.

| Family | Source package | Included subset | CSS weight range |
| --- | --- | --- | --- |
| Inter | @fontsource-variable/inter@5.3.0 | Latin, normal wght | 400–600 |
| Plus Jakarta Sans | @fontsource-variable/plus-jakarta-sans@5.3.0 | Latin, normal wght | 600–700 |
| Noto Sans Bengali | @fontsource-variable/noto-sans-bengali@5.3.0 | Bengali, normal wght | 400–700 |

[Font declarations](../foundation.css) retain the package unicode ranges and use font-display swap. Latin and Bengali
subsets cover the current English/Bangla UI, Bengali digits and taka sign. Expand subsets deliberately when other scripts
are introduced. Bengali system fallbacks include Nirmala UI, Vrinda and Noto Serif Bengali; availability varies by platform.

To reproduce the vendoring, use `npm pack` with each exact package/version, copy its corresponding files/*-wght-normal.woff2
and LICENSE without modification, then compare the recorded hashes. Package archives are not application dependencies.
