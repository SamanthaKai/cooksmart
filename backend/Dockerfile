FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1

CMD gunicorn app:app --bind 0.0.0.0:${PORT:-5000} --workers 2
