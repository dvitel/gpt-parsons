from openai import OpenAI

def generate_titles(sample = True):
    client = OpenAI()

    if sample:
        user_message = '''
        Generate a list of five Parsons puzzle titles suitable for high school students learning programming. Each title should reflect a fundamental programming concept or structure in a way that is engaging and educational. The titles should be clear and concise, hinting at the core programming concept being explored in each puzzle. 

        Consider the following programming topics when creating the titles:
        1. Basic variable types and operations.
        2. Simple conditional statements (if-else structures).
        3. Introductory loops (for and while loops).
        4. Single-dimensional arrays and their basic manipulations.
        5. The creation and usage of basic functions.

        Avoid advanced topics and ensure the titles are appealing and understandable to beginners in programming.

        Example titles:
        1. "Variable Ventures" - focusing on variable types and operations.
        2. "If-Else Islands" - based on conditional statements.
        ...
        '''
    else:
        user_message = '''
        Generate a list of {number_of_titles} Parsons puzzle titles suitable for high school students learning programming. Each title should reflect one of the specified programming concepts or structures in a way that is engaging and educational. The titles should be clear, concise, and appealing to beginners in programming.

        Programming Topics:
        {list_of_topics}

        For each topic, create a title that hints at the core programming concept being explored in the puzzle. Ensure that the titles are understandable and relevant to the topics provided.

        Example:
        If the list of topics includes "Basic variable types and operations" and "Simple conditional statements," then suitable titles might be "Variable Ventures" and "If-Else Islands" respectively.

        '''

    completion = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "You are teacher and a software engineer designing parsons puzzles for high school students."},
        {"role": "user", "content": user_message}
    ]
    )

    return (completion.choices[0].message)