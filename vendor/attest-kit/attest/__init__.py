"""attest — Attestation-Driven Development verification gate for AI agents.

The same module also provides the runtime ``claim`` decorator used by governed
projects: ``import attest; @attest.claim(...)``. It is a no-op — annotation
metadata is read from the AST by ``attest scan`` — so annotated tests remain
runnable by the native test runner.
"""

__version__ = "0.1.0"


def claim(id=None, description=None, mutates=None, basis="test"):
    """No-op decorator marking a load-bearing test.

    Metadata is read from the source AST by ``attest scan``; at runtime this
    only keeps the annotated test runnable.
    """

    def deco(fn):
        fn.__attest__ = {
            "id": id,
            "description": description,
            "mutates": mutates,
            "basis": basis,
        }
        return fn

    return deco
