from promptflow import tool


# The inputs section will change based on the arguments of the tool function, after you save the code
# Adding type to arguments and return value will help the system show the types properly
# Please update the function name/signature per need
@tool
def my_python_tool(function: str, test: str) -> str:

    try:
        t1 = exec(function)
        # print(t1)
        t2 = exec(test)
        # print(t2)
        return True
    except:
        # print("Error running the code!")
        return False

