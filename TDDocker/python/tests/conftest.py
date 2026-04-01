"""Pytest configuration — ensure td_docker is importable.

Provides lightweight TD fakes for testing extension setup code
without a TouchDesigner runtime.
"""

from __future__ import annotations


class FakeParNamespace:
    """Parameter namespace that raises ``AttributeError`` for missing params.

    Matches real TD behaviour where ``hasattr(comp.par, "X")`` is ``False``
    when parameter *X* does not exist on the component.
    """

    def __init__(self) -> None:
        # Store params in the instance dict directly via object.__setattr__
        pass

    def __getattr__(self, name: str):
        raise AttributeError(name)


class FakeMenuPar:
    """Fake TD string-menu parameter."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.val = ""
        self.menuNames: list[str] = []
        self.menuLabels: list[str] = []


class FakePar:
    """Fake TD parameter (pulse, folder, etc.)."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.val = ""


class FakePage:
    """Fake TD custom parameter page.

    When *owner_par* is provided, created parameters are registered on it
    so that ``hasattr(owner_par, name)`` returns ``True`` after creation.
    """

    def __init__(self, name: str, owner_par: FakeParNamespace | None = None) -> None:
        self.name = name
        self._owner_par = owner_par
        self._pars: list[FakePar | FakeMenuPar] = []

    def _register(self, par: FakePar | FakeMenuPar) -> None:
        self._pars.append(par)
        if self._owner_par is not None:
            object.__setattr__(self._owner_par, par.name, par)

    def appendStrMenu(self, name: str, label: str = "") -> list[FakeMenuPar]:
        p = FakeMenuPar(name)
        self._register(p)
        return [p]

    def appendPulse(self, name: str, label: str = "") -> FakePar:
        p = FakePar(name)
        self._register(p)
        return p

    def appendFolder(self, name: str, label: str = "") -> FakePar:
        p = FakePar(name)
        self._register(p)
        return p


class FakeOp:
    """Fake TD operator with minimal surface for setup tests."""

    def __init__(self, op_type: str = "textCOMP", name: str = "") -> None:
        self.OPType = op_type
        self.name = name
        self.par = FakeParNamespace()
        self.viewer = False
        self.nodeX = 0
        self.nodeY = 0
        self._rows: list[list[str]] = []
        self._destroyed = False

    def appendRow(self, row: list[str]) -> None:
        self._rows.append(row)

    def destroy(self) -> None:
        self._destroyed = True


class FakeOwnerComp:
    """Fake TD component standing in for ``self.ownerComp``.

    Tracks created child operators and custom pages.
    """

    def __init__(self) -> None:
        self.par = FakeParNamespace()
        self.customPages: list[FakePage] = []
        self._children: dict[str, FakeOp] = {}

    def op(self, name: str) -> FakeOp | None:
        return self._children.get(name)

    def create(self, op_type: str, name: str) -> FakeOp:
        child = FakeOp(op_type, name)
        self._children[name] = child
        return child

    def appendCustomPage(self, name: str) -> FakePage:
        page = FakePage(name, owner_par=self.par)
        self.customPages.append(page)
        return page
