import openai

def fetch_key():
    api_key_file_path = 'C:\\Users\\steph\\Documents\\open_ai_key.txt'

    try:
        with open(api_key_file_path, 'r') as file:
            api_key = file.read().strip()
    except FileNotFoundError:
        print("API key file not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

    if api_key:
        openai.api_key = api_key
        print("API key loaded successfully.")
        return api_key
    else:
        print("Failed to load the API key.")
        return None