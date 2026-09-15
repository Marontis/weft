# Vendored attest engine

This is a copy of the Attorn **attest-kit** mutation/attestation engine, vendored
so weft's CI and the fleet's mutation-kill loop run it with **no private-repo
access** — CI installs it with `pip install ./vendor/attest-kit`, pulling only
public dependencies (mutmut, pytest, pydantic).

`VENDORED_FROM.txt` records the attest-kit commit this copy was taken from.
weft doubles as a live test surface for the engine: fixes found here flow back
to the canonical attest-kit repo, then re-vendor to pick them up.
