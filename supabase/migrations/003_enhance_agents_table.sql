-- Enhance agents table for tool marketplace
ALTER TABLE agents ADD COLUMN IF NOT EXISTS usage_example TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS import_statement TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS documentation TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS repository_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT false;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category) WHERE verified = true;

-- Insert some built-in tools
INSERT INTO agents (name, description, package_name, version, category, import_statement, usage_example, documentation, is_builtin, verified, verified_at)
VALUES
  (
    'Web Scraper',
    'Scrape and extract content from websites. Useful for fetching data from URLs, parsing HTML, and extracting text or structured data from web pages.',
    'requests,beautifulsoup4',
    '1.0.0',
    'web',
    'import requests
from bs4 import BeautifulSoup',
    'response = requests.get("https://example.com")
soup = BeautifulSoup(response.text, "html.parser")
title = soup.find("title").text
print(title)',
    'Use requests to fetch URLs and BeautifulSoup to parse HTML. Always handle errors gracefully.',
    true,
    true,
    NOW()
  ),
  (
    'Data Analyzer',
    'Analyze data using pandas. Create dataframes, perform statistical analysis, filter and transform data, and generate insights from CSV or JSON data.',
    'pandas,numpy',
    '1.0.0',
    'data',
    'import pandas as pd
import numpy as np',
    'df = pd.DataFrame({"name": ["Alice", "Bob"], "age": [25, 30]})
print(df.describe())
print(df.groupby("name").mean())',
    'Use pandas for data manipulation. Supports CSV, JSON, and in-memory data structures.',
    true,
    true,
    NOW()
  ),
  (
    'Chart Generator',
    'Create charts and visualizations. Generate bar charts, line graphs, pie charts, scatter plots, and save them as image files.',
    'matplotlib,seaborn',
    '1.0.0',
    'visualization',
    'import matplotlib.pyplot as plt
import seaborn as sns',
    'plt.figure(figsize=(10, 6))
plt.bar(["A", "B", "C"], [10, 20, 15])
plt.title("Sample Chart")
plt.savefig("chart.png")
print("Chart saved to chart.png")',
    'Use matplotlib for basic charts and seaborn for statistical visualizations. Always save figures to files.',
    true,
    true,
    NOW()
  ),
  (
    'File Handler',
    'Read and write files. Handle CSV, JSON, TXT, and other file formats. Parse structured data and save outputs.',
    'csv,json',
    '1.0.0',
    'file',
    'import csv
import json',
    'with open("data.json", "w") as f:
    json.dump({"key": "value"}, f)
print("File saved")',
    'Use built-in csv and json modules for file operations. Always use context managers (with statements).',
    true,
    true,
    NOW()
  ),
  (
    'API Client',
    'Make HTTP requests to APIs. Fetch data from REST APIs, handle authentication, parse JSON responses.',
    'requests',
    '1.0.0',
    'web',
    'import requests',
    'response = requests.get("https://api.example.com/data", headers={"Authorization": "Bearer token"})
data = response.json()
print(data)',
    'Use requests for HTTP calls. Handle status codes and parse JSON responses.',
    true,
    true,
    NOW()
  ),
  (
    'Image Processor',
    'Process and manipulate images. Resize, crop, convert formats, add text overlays, and save processed images.',
    'pillow',
    '1.0.0',
    'media',
    'from PIL import Image, ImageDraw, ImageFont',
    'img = Image.new("RGB", (200, 100), color="blue")
draw = ImageDraw.Draw(img)
draw.text((10, 10), "Hello!", fill="white")
img.save("output.png")
print("Image saved to output.png")',
    'Use Pillow (PIL) for image manipulation. Supports PNG, JPEG, and other formats.',
    true,
    true,
    NOW()
  ),
  (
    'Math & Statistics',
    'Perform mathematical calculations and statistical analysis. Calculate mean, median, standard deviation, perform regression, solve equations.',
    'numpy,scipy',
    '1.0.0',
    'math',
    'import numpy as np
from scipy import stats',
    'data = np.array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
print(f"Mean: {np.mean(data)}")
print(f"Std: {np.std(data)}")
print(f"Correlation: {np.corrcoef(data, data**2)[0,1]}")',
    'Use numpy for numerical operations and scipy for advanced statistics.',
    true,
    true,
    NOW()
  ),
  (
    'Text Processor',
    'Process and analyze text. Regex matching, string manipulation, text cleaning, word counting, and basic NLP tasks.',
    're,collections',
    '1.0.0',
    'text',
    'import re
from collections import Counter',
    'text = "Hello world hello"
words = text.lower().split()
counts = Counter(words)
print(counts.most_common(5))',
    'Use re for regex patterns and collections for counting. Good for text analysis.',
    true,
    true,
    NOW()
  ),
  (
    'Date & Time',
    'Work with dates and times. Parse dates, calculate differences, format timestamps, handle timezones.',
    'datetime',
    '1.0.0',
    'utility',
    'from datetime import datetime, timedelta',
    'now = datetime.now()
future = now + timedelta(days=30)
print(f"Today: {now.strftime(\"%Y-%m-%d\")}")
print(f"In 30 days: {future.strftime(\"%Y-%m-%d\")}")',
    'Use datetime for all date/time operations. Use timedelta for date arithmetic.',
    true,
    true,
    NOW()
  ),
  (
    'Random Generator',
    'Generate random data. Create random numbers, shuffle lists, sample data, generate UUIDs and random strings.',
    'random,uuid',
    '1.0.0',
    'utility',
    'import random
import uuid',
    'print(f"Random int: {random.randint(1, 100)}")
print(f"UUID: {uuid.uuid4()}")
items = [1, 2, 3, 4, 5]
random.shuffle(items)
print(f"Shuffled: {items}")',
    'Use random for randomness and uuid for unique identifiers.',
    true,
    true,
    NOW()
  )
ON CONFLICT (package_name) DO NOTHING;
