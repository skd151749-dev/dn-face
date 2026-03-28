"""
Minimal pkg_resources shim for face_recognition_models.
This avoids a hard dependency on setuptools while providing
resource_filename() used to locate model files.
"""

from __future__ import annotations

import importlib
import os
from importlib import resources


def resource_filename(package_or_requirement, resource_name: str) -> str:
    """
    Return an absolute path to a resource within a package.
    Compatible with pkg_resources.resource_filename(package, resource).
    """
    if hasattr(package_or_requirement, "__name__"):
        package_name = package_or_requirement.__name__
    else:
        package_name = str(package_or_requirement)

    try:
        base = resources.files(package_name)
        return str(base.joinpath(resource_name))
    except Exception:
        pkg = importlib.import_module(package_name)
        return os.path.join(os.path.dirname(pkg.__file__), resource_name)

