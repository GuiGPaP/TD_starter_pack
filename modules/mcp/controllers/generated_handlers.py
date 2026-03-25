# Auto-generated MCP handlers
import json
import inspect
import re
from utils.types import Result
from utils.result import error_result

# Service instance singleton pattern
_api_service_instance = None

def get_api_service():
    global _api_service_instance
    if _api_service_instance is None:
        from mcp.services.api_service import api_service
        _api_service_instance = api_service
    return _api_service_instance

def camel_to_snake(name):
    """Convert camelCase to snake_case"""
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()

def delete_node(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: delete_node
    """
    try:
        print(f"[DEBUG] Handler 'delete_node' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "delete_node", None)
        if not callable(service_method):
            return error_result("Service method 'delete_node' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'delete_node' failed: {str(e)}")
def get_nodes(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_nodes
    """
    try:
        print(f"[DEBUG] Handler 'get_nodes' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_nodes", None)
        if not callable(service_method):
            return error_result("Service method 'get_nodes' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_nodes' failed: {str(e)}")
def create_node(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: create_node
    """
    try:
        print(f"[DEBUG] Handler 'create_node' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "create_node", None)
        if not callable(service_method):
            return error_result("Service method 'create_node' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'create_node' failed: {str(e)}")
def get_node_detail(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_node_detail
    """
    try:
        print(f"[DEBUG] Handler 'get_node_detail' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_node_detail", None)
        if not callable(service_method):
            return error_result("Service method 'get_node_detail' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_node_detail' failed: {str(e)}")
def update_node(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: update_node
    """
    try:
        print(f"[DEBUG] Handler 'update_node' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "update_node", None)
        if not callable(service_method):
            return error_result("Service method 'update_node' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'update_node' failed: {str(e)}")
def get_node_errors(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_node_errors
    """
    try:
        print(f"[DEBUG] Handler 'get_node_errors' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_node_errors", None)
        if not callable(service_method):
            return error_result("Service method 'get_node_errors' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_node_errors' failed: {str(e)}")
def get_dat_text(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_dat_text
    """
    try:
        print(f"[DEBUG] Handler 'get_dat_text' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_dat_text", None)
        if not callable(service_method):
            return error_result("Service method 'get_dat_text' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_dat_text' failed: {str(e)}")
def set_dat_text(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: set_dat_text
    """
    try:
        print(f"[DEBUG] Handler 'set_dat_text' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "set_dat_text", None)
        if not callable(service_method):
            return error_result("Service method 'set_dat_text' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'set_dat_text' failed: {str(e)}")
def lint_dat(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: lint_dat
    """
    try:
        print(f"[DEBUG] Handler 'lint_dat' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "lint_dat", None)
        if not callable(service_method):
            return error_result("Service method 'lint_dat' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'lint_dat' failed: {str(e)}")
def format_dat(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: format_dat
    """
    try:
        print(f"[DEBUG] Handler 'format_dat' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "format_dat", None)
        if not callable(service_method):
            return error_result("Service method 'format_dat' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'format_dat' failed: {str(e)}")
def validate_json_dat(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: validate_json_dat
    """
    try:
        print(f"[DEBUG] Handler 'validate_json_dat' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "validate_json_dat", None)
        if not callable(service_method):
            return error_result("Service method 'validate_json_dat' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'validate_json_dat' failed: {str(e)}")
def validate_glsl_dat(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: validate_glsl_dat
    """
    try:
        print(f"[DEBUG] Handler 'validate_glsl_dat' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "validate_glsl_dat", None)
        if not callable(service_method):
            return error_result("Service method 'validate_glsl_dat' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'validate_glsl_dat' failed: {str(e)}")
def lint_dats(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: lint_dats
    """
    try:
        print(f"[DEBUG] Handler 'lint_dats' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "lint_dats", None)
        if not callable(service_method):
            return error_result("Service method 'lint_dats' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'lint_dats' failed: {str(e)}")
def typecheck_dat(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: typecheck_dat
    """
    try:
        print(f"[DEBUG] Handler 'typecheck_dat' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "typecheck_dat", None)
        if not callable(service_method):
            return error_result("Service method 'typecheck_dat' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'typecheck_dat' failed: {str(e)}")
def discover_dat_candidates(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: discover_dat_candidates
    """
    try:
        print(f"[DEBUG] Handler 'discover_dat_candidates' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "discover_dat_candidates", None)
        if not callable(service_method):
            return error_result("Service method 'discover_dat_candidates' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'discover_dat_candidates' failed: {str(e)}")
def get_node_parameter_schema(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_node_parameter_schema
    """
    try:
        print(f"[DEBUG] Handler 'get_node_parameter_schema' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_node_parameter_schema", None)
        if not callable(service_method):
            return error_result("Service method 'get_node_parameter_schema' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_node_parameter_schema' failed: {str(e)}")
def complete_op_paths(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: complete_op_paths
    """
    try:
        print(f"[DEBUG] Handler 'complete_op_paths' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "complete_op_paths", None)
        if not callable(service_method):
            return error_result("Service method 'complete_op_paths' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'complete_op_paths' failed: {str(e)}")
def get_chop_channels(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_chop_channels
    """
    try:
        print(f"[DEBUG] Handler 'get_chop_channels' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_chop_channels", None)
        if not callable(service_method):
            return error_result("Service method 'get_chop_channels' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_chop_channels' failed: {str(e)}")
def get_dat_table_info(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_dat_table_info
    """
    try:
        print(f"[DEBUG] Handler 'get_dat_table_info' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_dat_table_info", None)
        if not callable(service_method):
            return error_result("Service method 'get_dat_table_info' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_dat_table_info' failed: {str(e)}")
def get_comp_extensions(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_comp_extensions
    """
    try:
        print(f"[DEBUG] Handler 'get_comp_extensions' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_comp_extensions", None)
        if not callable(service_method):
            return error_result("Service method 'get_comp_extensions' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_comp_extensions' failed: {str(e)}")
def get_td_python_classes(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_td_python_classes
    """
    try:
        print(f"[DEBUG] Handler 'get_td_python_classes' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_td_python_classes", None)
        if not callable(service_method):
            return error_result("Service method 'get_td_python_classes' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_td_python_classes' failed: {str(e)}")
def get_td_python_class_details(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_td_python_class_details
    """
    try:
        print(f"[DEBUG] Handler 'get_td_python_class_details' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_td_python_class_details", None)
        if not callable(service_method):
            return error_result("Service method 'get_td_python_class_details' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_td_python_class_details' failed: {str(e)}")
def get_module_help(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_module_help
    """
    try:
        print(f"[DEBUG] Handler 'get_module_help' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_module_help", None)
        if not callable(service_method):
            return error_result("Service method 'get_module_help' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_module_help' failed: {str(e)}")
def exec_node_method(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: exec_node_method
    """
    try:
        print(f"[DEBUG] Handler 'exec_node_method' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "exec_node_method", None)
        if not callable(service_method):
            return error_result("Service method 'exec_node_method' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'exec_node_method' failed: {str(e)}")
def exec_python_script(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: exec_python_script
    """
    try:
        print(f"[DEBUG] Handler 'exec_python_script' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "exec_python_script", None)
        if not callable(service_method):
            return error_result("Service method 'exec_python_script' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'exec_python_script' failed: {str(e)}")
def get_td_info(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_td_info
    """
    try:
        print(f"[DEBUG] Handler 'get_td_info' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_td_info", None)
        if not callable(service_method):
            return error_result("Service method 'get_td_info' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_td_info' failed: {str(e)}")
def get_health(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_health
    """
    try:
        print(f"[DEBUG] Handler 'get_health' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_health", None)
        if not callable(service_method):
            return error_result("Service method 'get_health' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_health' failed: {str(e)}")
def get_capabilities(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_capabilities
    """
    try:
        print(f"[DEBUG] Handler 'get_capabilities' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_capabilities", None)
        if not callable(service_method):
            return error_result("Service method 'get_capabilities' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_capabilities' failed: {str(e)}")
def create_geometry_comp(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: create_geometry_comp
    """
    try:
        print(f"[DEBUG] Handler 'create_geometry_comp' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "create_geometry_comp", None)
        if not callable(service_method):
            return error_result("Service method 'create_geometry_comp' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'create_geometry_comp' failed: {str(e)}")
def create_feedback_loop(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: create_feedback_loop
    """
    try:
        print(f"[DEBUG] Handler 'create_feedback_loop' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "create_feedback_loop", None)
        if not callable(service_method):
            return error_result("Service method 'create_feedback_loop' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'create_feedback_loop' failed: {str(e)}")
def configure_instancing(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: configure_instancing
    """
    try:
        print(f"[DEBUG] Handler 'configure_instancing' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "configure_instancing", None)
        if not callable(service_method):
            return error_result("Service method 'configure_instancing' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'configure_instancing' failed: {str(e)}")
def index_td_project(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: index_td_project
    """
    try:
        print(f"[DEBUG] Handler 'index_td_project' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "index_td_project", None)
        if not callable(service_method):
            return error_result("Service method 'index_td_project' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'index_td_project' failed: {str(e)}")
def copy_node(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: copy_node
    """
    try:
        print(f"[DEBUG] Handler 'copy_node' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "copy_node", None)
        if not callable(service_method):
            return error_result("Service method 'copy_node' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'copy_node' failed: {str(e)}")
def connect_nodes(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: connect_nodes
    """
    try:
        print(f"[DEBUG] Handler 'connect_nodes' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "connect_nodes", None)
        if not callable(service_method):
            return error_result("Service method 'connect_nodes' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'connect_nodes' failed: {str(e)}")
def get_td_context(body: str = None, **kwargs) -> Result:
    """
    Auto-generated handler for operation: get_td_context
    """
    try:
        print(f"[DEBUG] Handler 'get_td_context' called with body: {body}, kwargs: {kwargs}")
        service_method = getattr(get_api_service(), "get_td_context", None)
        if not callable(service_method):
            return error_result("Service method 'get_td_context' not implemented")

        # Merge body
        if body:
            try:
                parsed_body = json.loads(body)
                kwargs.update(parsed_body)
            except Exception as e:
                return error_result(f"Invalid JSON body: {str(e)}")

        # CamelCase → SnakeCase 変換
        kwargs_snake_case = {camel_to_snake(k): v for k, v in kwargs.items()}

        sig = inspect.signature(service_method)

        # Prepare args matching the function signature
        call_args = {}
        for param_name in sig.parameters:
            if param_name in kwargs_snake_case:
                call_args[param_name] = kwargs_snake_case[param_name]

        return service_method(**call_args)

    except Exception as e:
        return error_result(f"Handler for 'get_td_context' failed: {str(e)}")

__all__ = [
  "delete_node",
  "get_nodes",
  "create_node",
  "get_node_detail",
  "update_node",
  "get_node_errors",
  "get_dat_text",
  "set_dat_text",
  "lint_dat",
  "format_dat",
  "validate_json_dat",
  "validate_glsl_dat",
  "lint_dats",
  "typecheck_dat",
  "discover_dat_candidates",
  "get_node_parameter_schema",
  "complete_op_paths",
  "get_chop_channels",
  "get_dat_table_info",
  "get_comp_extensions",
  "get_td_python_classes",
  "get_td_python_class_details",
  "get_module_help",
  "exec_node_method",
  "exec_python_script",
  "get_td_info",
  "get_health",
  "get_capabilities",
  "create_geometry_comp",
  "create_feedback_loop",
  "configure_instancing",
  "index_td_project",
  "copy_node",
  "connect_nodes",
  "get_td_context",
]
