"""Type stubs for TouchDesigner's td module (runtime-only)."""

from typing import Any

class _App:
    version: str
    build: str
    osName: str
    osVersion: str

class _Par:
    name: str
    val: Any
    def eval(self) -> Any: ...

class _ParCollection:
    def __getattr__(self, name: str) -> _Par: ...

class _Channel:
    name: str
    vals: list[float]

class _Cell:
    val: str

class OP:
    valid: bool
    path: str
    name: str
    id: int
    OPType: str
    text: str
    par: _ParCollection
    family: str

    # Navigation
    def parent(self) -> OP | None: ...

    # CHOP attributes (polymorphic — td.op() returns any operator family)
    numChans: int
    numSamples: int
    sampleRate: float
    def chan(self, index: int | str) -> _Channel | None: ...

    # DAT attributes
    numRows: int
    numCols: int
    def __getitem__(self, key: tuple[int, int]) -> _Cell | None: ...

    # COMP attributes
    extensions: list[object]
    children: list[OP]

    # Layout (used by td_helpers)
    nodeX: int
    nodeY: int
    nodeWidth: int
    nodeHeight: int
    viewer: bool
    display: bool
    render: bool
    docked: list[OP]

    def pars(self, pattern: str) -> list[_Par]: ...
    def create(self, node_type: str, node_name: str | None = None) -> OP | None: ...
    def destroy(self) -> None: ...
    def findChildren(
        self,
        name: str | None = None,
        depth: int | None = None,
    ) -> list[OP]: ...
    def errors(self, recurse: bool = False) -> str: ...

class _OpFunc:
    me: OP | None
    def __call__(self, path: object) -> OP | None: ...

app: _App
op: _OpFunc
ops: Any
project: Any
tdu: Any
