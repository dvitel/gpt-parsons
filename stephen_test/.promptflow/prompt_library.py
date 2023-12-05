from openai import OpenAI

def generate_title(topics = None, gpt_model = "gpt-3.5-turbo"):
    client = OpenAI()

    if topics:
        user_message = f'''
        Generate a Parson puzzle title suitable for high school students learning programming. The title should reflect a fundamental programming concept or structure in a way that is engaging and educational. The title should be clear and concise, hinting at the core programming concept being explored in each puzzle. 

        Consider the following programming topics when creating the title:
        {topics}

        Avoid advanced topics and ensure the title is appealing and understandable to beginners in programming.

        Output only a single title and nothing else:

        '''
    else:
        user_message = '''
        Generate a Parson puzzle title suitable for high school students learning programming. The title should reflect a fundamental programming concept or structure in a way that is engaging and educational. The title should be clear and concise, hinting at the core programming concept being explored in each puzzle. 

        Consider the following programming topics when creating the title: if-else statements, loops

        Avoid advanced topics and ensure the title is appealing and understandable to beginners in programming.

        Output only a single title and nothing else:

        '''

    completion = client.chat.completions.create(
    model = gpt_model,
    messages=[
        {"role": "system", "content": "You are teacher and a software engineer designing parsons puzzles for high school students."},
        {"role": "user", "content": user_message}
    ]
    )

    return (completion.choices[0].message.content.split('\n'))

def generate_psudocode(title = None, topics = None, gpt_model = "gpt-3.5-turbo"):
    client = OpenAI()

    if title and topics:
        user_message = f'''
        Create a simple program in psudocode based on the title of "{title}" that clearly embodies the programming concepts of: "{topics}" through its logic and structure.
        
        This program will be used for a Parsons puzzle, so it should consist of discrete code blocks that can be rearranged. The program should:
        - Be beginner-friendly
        - suitable for high school students
        - Be divided into distinct code blocks that can be mixed up for the puzzle
        - Exclude comments to maintain the challenge of the puzzle
        - Be concise and functionally complete
        - able to run successfully when arranged correctly
        
        Ensure the code is broken down into logical segments that can be rearranged, such as variable declarations, loops, conditional statements, function calls, etc.
        
        Comment the code heavily so that it is easily understood. Generate the psudocode block and nothing else:

        '''
    else:
        user_message = '''
        Create a simple program in psudocode based on the title of "If-Else Odyssey" that clearly embodies the programming concepts of: if else statements through its logic and structure.
        
        This program will be used for a Parsons puzzle, so it should consist of discrete code blocks that can be rearranged. The program should:
        - Be beginner-friendly
        - suitable for high school students
        - Be divided into distinct code blocks that can be mixed up for the puzzle
        - Exclude comments to maintain the challenge of the puzzle
        - Be concise and functionally complete
        - able to run successfully when arranged correctly
        
        Ensure the code is broken down into logical segments that can be rearranged, such as variable declarations, loops, conditional statements, function calls, etc.
        
        Comment the code heavily so that it is easily understood. Generate the psudocode block and nothing else:

        '''

    completion = client.chat.completions.create(
    model = gpt_model,
    messages=[
        {"role": "system", "content": "You are teacher and a software engineer designing parsons puzzles for high school students."},
        {"role": "user", "content": user_message}
    ]
    )

    return (completion.choices[0].message.content.split('\n'))

def generate_code(title, topics, pseudocode, gpt_model = "gpt-3.5-turbo"):
    client = OpenAI()

    if title and topics and pseudocode:
        user_message = f'''
        Title: {title}

        Topics: {topics}

        Pseudocode:
        {pseudocode}

        Based on the provided pseudocode, title, and list of topics, generate a Parsons puzzle that integrates these themes into its structure. The puzzle should not only rearrange code snippets into the correct order but also reflect the overarching themes and concepts indicated in the title and topic list. This will help reinforce the learning objectives for high school students.

        Python Program:
        [Generate the corresponding Python program that aligns with the pseudocode, title, and topics. Break down the program into discrete, logical blocks that can be used as the basis for the Parsons puzzle. Each block should clearly represent a step or concept in the code, while also being themed around the title and topics provided. The program should be a direct reflection of the pseudocode, ensuring consistency and thematic relevance. Make sure each line has a step comment associated with it for easy reorganization as a parson's puzzle]
        
        Comment the code heavily so that it is easily understood. Generate the code block, comments, and nothing else:

        '''

    completion = client.chat.completions.create(
    model = gpt_model,
    messages=[
        {"role": "system", "content": "You are teacher and a software engineer designing parsons puzzles for high school students."},
        {"role": "user", "content": user_message}
    ]
    )

    return (completion.choices[0].message.content.split('\n'))