from openai import OpenAI

import utils
import prompt_library

# Configure your API key (replace 'your-api-key' with your actual API key)
api_key = utils.fetch_key()

topics = 'loops, arrays'

gpt_model = "gpt-3.5-turbo"
gpt_model = "gpt-4"

title = prompt_library.generate_title(topics, gpt_model)

psudocode = prompt_library.generate_psudocode(title, topics, gpt_model)

parsons_code = prompt_library.generate_code(title, topics, psudocode, gpt_model)

with open("title.txt", "a") as title_file:
    for line in title:
        title_file.write(line + "\n")

with open("pseudocode.txt", "a") as pseudocode_file:
    for line in psudocode:
        pseudocode_file.write(line + "\n")

with open("parsons_code.txt", "a") as parsons_file:
    for line in parsons_code:
        parsons_file.write(line + "\n")