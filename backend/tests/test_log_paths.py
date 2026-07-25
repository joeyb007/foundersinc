import os
import tempfile

from app.agents.base import _summarize_input


def test_paths_are_reported_relative_to_the_checkout():
    """The board renders these log lines verbatim and derives its "files
    touched" column from them, so an absolute temp path is noise."""
    with tempfile.TemporaryDirectory() as cwd:
        summary = _summarize_input({"file_path": os.path.join(cwd, "src/app.tsx")}, cwd)
    assert summary == "file_path='src/app.tsx'"


def test_symlinked_temp_dirs_still_relativize():
    """Regression: macOS hands out /var/folders/... from mkdtemp while the
    agent's tools report the resolved /private/var/folders/..., so comparing
    the two raw never matched and every path logged absolute."""
    with tempfile.TemporaryDirectory() as cwd:
        # os.path.realpath is what the agent's tooling effectively reports.
        resolved = os.path.realpath(cwd)
        summary = _summarize_input({"file_path": os.path.join(resolved, "src/app.tsx")}, cwd)
    assert summary == "file_path='src/app.tsx'"


def test_paths_outside_the_checkout_are_left_alone():
    with tempfile.TemporaryDirectory() as cwd:
        summary = _summarize_input({"file_path": "/etc/hosts"}, cwd)
    assert summary == "file_path='/etc/hosts'"


def test_non_path_args_are_untouched():
    with tempfile.TemporaryDirectory() as cwd:
        assert _summarize_input({"command": "pytest -q"}, cwd) == "command='pytest -q'"
