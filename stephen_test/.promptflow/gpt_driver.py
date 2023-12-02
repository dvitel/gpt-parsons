from openai import OpenAI

import utils
import prompt_library

# Configure your API key (replace 'your-api-key' with your actual API key)
api_key = utils.fetch_key()

titles = prompt_library.generate_titles(False)

print(titles)