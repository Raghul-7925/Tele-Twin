FROM python:3.11-slim

# Node.js for frontend build
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything first
COPY . .

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Build frontend
RUN cd frontend && npm install && npm run build

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
