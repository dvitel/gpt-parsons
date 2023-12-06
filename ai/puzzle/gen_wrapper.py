from promptflow import tool


# The inputs section will change based on the arguments of the tool function, after you save the code
# Adding type to arguments and return value will help the system show the types properly
# Please update the function name/signature per need
@tool
def output_wrapper(task: str, code: str, incorrect: str, explain: str, tests: str) -> str:
    data = {
        "task": task,
        "code": code,
        "incorrect": incorrect,
        "explain": explain,
        "tests": tests
    }

    # Return the dictionary
    return data