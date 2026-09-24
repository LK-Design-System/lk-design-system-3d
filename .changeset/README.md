# Changesets

The eight publishable platform packages (every `packages/*` manifest) ship as one fixed
version group — `config.json` lists them; tf and markers were missing until 2026-09-24
although all eight released together at 0.1.0-alpha.2. A changeset is
required for public-contract changes after the local Alpha gate; local tarball smoke
does not authorize registry publication.
