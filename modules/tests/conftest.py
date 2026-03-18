"""Shared fixtures for the tests package.

The `td` module is only available inside the TouchDesigner runtime.
We inject a lightweight mock into sys.modules early so that any transitive
import of `td` (e.g. mcp.services.api_service) does not blow up at
collection time.
"""

import sys
from unittest.mock import MagicMock

# Insert mock *before* any mcp.* import triggers `import td`
if "td" not in sys.modules:
	sys.modules["td"] = MagicMock()
