"""Type stubs for TouchDesigner's td module (runtime-only)."""

from typing import Any

class _App:
    version: str
    build: str
    osName: str
    osVersion: str

class Par:
    name: str
    val: Any
    label: str
    style: str
    default: Any
    min: float
    max: float
    clampMin: bool
    clampMax: bool
    menuNames: list[str]
    menuLabels: list[str]
    isOP: bool
    readOnly: bool
    page: Page
    def eval(self) -> Any: ...

class Page:
    name: str
    pars: list[Par]

class ParGroup:
    name: str
    def __getattr__(self, name: str) -> Par: ...

class _ParCollection:
    def __getattr__(self, name: str) -> Par: ...

class Cell:
    val: str
    row: int
    col: int

class Channel:
    name: str
    vals: list[float]

class Matrix:
    def __init__(self, *args: Any) -> None: ...
    def __mul__(self, other: Matrix) -> Matrix: ...

class Position:
    x: float
    y: float
    z: float

class Vector:
    x: float
    y: float
    z: float

class OP:
    valid: bool
    path: str
    name: str
    id: int
    OPType: str
    text: str
    par: _ParCollection
    type: str
    subType: str
    family: str
    ext: Any
    nodeX: int
    nodeY: int
    nodeWidth: int
    nodeHeight: int
    viewer: bool
    display: bool
    render: bool
    docked: list[OP]
    inputConnectors: list[Any]
    outputConnectors: list[Any]
    inputs: list[OP]
    outputs: list[OP]
    # CHOP attributes (available on all OPs for duck-typing compatibility)
    numChans: int
    numSamples: int
    sampleRate: float
    # DAT attributes
    numRows: int
    numCols: int
    # COMP attributes
    extensions: list[Any]

    def parent(self, *args: Any) -> OP | None: ...
    def pars(self, pattern: str = ...) -> list[Par]: ...
    def create(self, node_type: str, node_name: str | None = None) -> OP | None: ...
    def destroy(self) -> None: ...
    def findChildren(
        self,
        name: str | None = None,
        depth: int | None = None,
    ) -> list[OP]: ...
    def errors(self, recurse: bool = False) -> str: ...
    def chan(self, index: int | str) -> Channel | None: ...
    def __getitem__(self, key: Any) -> Any: ...

class COMP(OP):
    extensions: list[Any]

class SOP(OP): ...
class TOP(OP): ...

class CHOP(OP):
    numChans: int
    numSamples: int
    sampleRate: float
    def chan(self, index: int | str) -> Channel | None: ...

class DAT(OP):
    text: str
    numRows: int
    numCols: int

class _OpFunc:
    me: OP | None
    def __call__(self, path: object) -> OP | None: ...

app: _App
op: _OpFunc
ops: Any
project: Any
tdu: Any
