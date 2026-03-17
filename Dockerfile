FROM python:3.11-slim-bookworm

WORKDIR /app

COPY server/requirements.txt .
RUN pip install -r requirements.txt

COPY server/ .

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]