FROM python:3.11-slim
RUN pip install --no-cache-dir python-osc
COPY osc_echo.py /app/
CMD ["python", "-u", "/app/osc_echo.py"]
