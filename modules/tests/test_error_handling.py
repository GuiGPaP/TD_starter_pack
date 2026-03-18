"""Tests for utils.error_handling module."""

from unittest.mock import patch

from utils.error_handling import (
	ErrorCategory,
	categorize_error,
	format_error,
	handle_service_errors,
)
from utils.result import success_result


class TestCategorizeError:
	def test_value_error(self):
		assert categorize_error(ValueError("bad")) == ErrorCategory.VALIDATION

	def test_file_not_found(self):
		assert categorize_error(FileNotFoundError("gone")) == ErrorCategory.NOT_FOUND

	def test_not_found_in_message(self):
		assert categorize_error(RuntimeError("item not found")) == ErrorCategory.NOT_FOUND

	def test_doesnt_exist_in_message(self):
		assert categorize_error(RuntimeError("it doesn't exist")) == ErrorCategory.NOT_FOUND

	def test_permission_in_message(self):
		assert categorize_error(RuntimeError("permission denied")) == ErrorCategory.PERMISSION

	def test_access_denied_in_message(self):
		assert categorize_error(RuntimeError("access denied here")) == ErrorCategory.PERMISSION

	def test_network_in_message(self):
		assert categorize_error(RuntimeError("network timeout")) == ErrorCategory.NETWORK

	def test_connection_in_message(self):
		assert categorize_error(RuntimeError("connection refused")) == ErrorCategory.NETWORK

	def test_external_in_message(self):
		assert categorize_error(RuntimeError("external failure")) == ErrorCategory.EXTERNAL

	def test_service_unavailable_in_message(self):
		assert categorize_error(RuntimeError("service unavailable")) == ErrorCategory.EXTERNAL

	def test_fallback_internal(self):
		assert categorize_error(RuntimeError("something weird")) == ErrorCategory.INTERNAL


class TestFormatError:
	def test_with_category(self):
		assert format_error("oops", ErrorCategory.VALIDATION) == "VALIDATION: oops"

	def test_default_category(self):
		assert format_error("oops") == "INTERNAL: oops"

	def test_not_found(self):
		assert format_error("gone", ErrorCategory.NOT_FOUND) == "NOT_FOUND: gone"


class TestHandleServiceErrors:
	@patch("utils.error_handling.log_message")
	def test_success_passthrough(self, mock_log):
		@handle_service_errors
		def good():
			return success_result("ok")

		r = good()
		assert r["success"] is True
		assert r["data"] == "ok"

	@patch("utils.error_handling.log_message")
	def test_exception_returns_error_result(self, mock_log):
		@handle_service_errors
		def bad():
			raise ValueError("nope")

		r = bad()
		assert r["success"] is False
		assert "nope" in r["error"]
		assert "VALIDATION" in r["error"]

	@patch("utils.error_handling.log_message")
	def test_preserves_function_name(self, mock_log):
		@handle_service_errors
		def my_func():
			return success_result(None)

		assert my_func.__name__ == "my_func"

	@patch("utils.error_handling.log_message")
	def test_error_category_in_metadata(self, mock_log):
		@handle_service_errors
		def failing():
			raise FileNotFoundError("missing")

		r = failing()
		assert r["errorCategory"] == ErrorCategory.NOT_FOUND  # type: ignore[typeddict-item]
