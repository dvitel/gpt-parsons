# ---------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# ---------------------------------------------------------

from promptflow import tool
import json 
import sys 

def best_alignment(seq1, seq2):
    ''' Computes best alignment between two sequences (edit distance).
        The result is dynamic programming matrix 
    '''
    pass #TODO

# The inputs section will change based on the arguments of the tool function, after you save the code
# Adding type to arguments and return value will help the system show the types properly
# Please update the function name/signature per need

@tool
def validate_gen(input1: str) -> str:
    try:
        generated = json.loads(input1)      
    except Exception as e:
        print(f"Cannot parse model output: {e}. Output: {input1}", file=sys.stderr)
        return {"error": "JsonParseError", "message": f"Cannot parse: {input1}"}    
    try: #simple validation of AI output - add more
        compile(generated["code"], "ex0", "exec")
    except SyntaxError as e: 
        code = generated["code"]
        print(f"Syntax error in model code: {e}. Code: {code}")
        return {"error": "SyntaxError", "message": f"Error {e} in {code}"}
    code_lines = generated["code"].split("\\n")
    bugged_lines = generated["bugged"].split("\\n")
    #TODO: dynamic programming to figure out best alignment between correct and bugged lines 
    # lines = []
    # i = 0
    # j = 0 
    # while i < len(code_lines):
    #     if j >= len(bugged_lines) or code_lines[i] == bugged_lines[j]:
    #         lines.append({"correct": code_lines[i]})
    #         i = i + 1 
    #         j = j + 1 
    #     else: 
    #         start_j = j 
    #         while j < len(bugged_lines) and code_lines[i] != bugged_lines[j]:
    #             j = j + 1             
    #         lines.append({"correct": code_lines[i], "bugged": "\\n".join(bugged_lines[start_j:j])})
    # del generated["code"]
    # del generated["bugged"]
    generated["lines"] = lines 
    return generated