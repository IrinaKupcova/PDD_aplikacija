from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-5",
    input="Uzraksti vienu īsu joku latviski"
)

print(response.output_text)
