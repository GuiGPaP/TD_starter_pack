# Security Documentation - LIDAR Control API v2.0.0

## 🔐 Security Improvements Implemented

### Critical Vulnerabilities Fixed

1. **Command Injection Prevention**
   - ✅ Input validation with Pydantic validators
   - ✅ Whitelist-based model validation
   - ✅ Regex patterns for serial ports and frame IDs
   - ✅ Subprocess arguments are now validated and sanitized

2. **Authentication & Authorization**
   - ✅ JWT Bearer token authentication on all sensitive endpoints
   - ✅ API key validation for CRUD operations
   - ✅ Public read-only endpoints (models, health) remain unauthenticated

3. **CORS Security**
   - ✅ Restricted to specific origins (no more wildcard *)
   - ✅ Limited HTTP methods (GET, POST only)
   - ✅ Specific headers allowed

4. **Container Security**
   - ✅ Non-root user (lidar:1001) 
   - ✅ Removed privileged mode
   - ✅ Minimal capabilities (CAP_DAC_OVERRIDE only)
   - ✅ Resource limits (1GB RAM, 1 CPU)
   - ✅ Bridge network instead of host network

5. **Input Validation**
   - ✅ Pydantic models with strict validation
   - ✅ Baudrate limits (9600-2000000)
   - ✅ Serial port format validation
   - ✅ Frame ID format validation
   - ✅ LIDAR model whitelist

## 🚀 Deployment Security Guide

### 1. Generate API Key
```bash
# Generate a secure API key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your settings
LIDAR_API_KEY=your_generated_api_key_here
CORS_ALLOWED_ORIGINS=http://your-touchdesigner-ip:port
```

### 3. Build and Deploy
```bash
# Build with security hardening
docker-compose build --no-cache

# Deploy with security configuration
docker-compose up -d

# Verify security configuration
docker-compose exec sllidar id  # Should show uid=1001(lidar)
```

### 4. Test API Security
```bash
# Test without API key (should fail)
curl -X POST http://localhost:8080/launch

# Test with valid API key
curl -X POST http://localhost:8080/launch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lidar_model": "a1"}'
```

## 🛡️ Security Best Practices

### Network Security
- Use bridge network mode for container isolation
- Configure firewall rules to restrict access
- Use reverse proxy (nginx) with SSL/TLS in production
- Monitor network connections

### Access Control
- Generate unique API keys per client
- Rotate API keys regularly
- Use HTTPS in production environments
- Implement rate limiting

### Monitoring & Logging
- Monitor failed authentication attempts
- Log all API access with timestamps
- Set up alerts for suspicious activities
- Regular security audits

### Container Security
- Keep base images updated
- Scan for vulnerabilities regularly
- Use minimal base images
- Regular security patches

## 🚨 Incident Response

### If API Key is Compromised:
1. Generate new API key immediately
2. Update all client configurations
3. Restart container with new key
4. Check logs for unauthorized access

### If Container is Compromised:
1. Stop container immediately: `docker-compose down`
2. Check host system for compromise
3. Rebuild container from scratch
4. Review access logs

## 📊 Security Metrics

Monitor these security metrics:
- Failed authentication attempts per hour
- API endpoint access patterns
- WebSocket connection durations
- Resource usage patterns
- Container restarts/crashes

## ⚠️ Known Limitations

1. **Device Access**: Container still needs access to `/dev/ttyUSB0`
2. **Local Network**: API currently runs on localhost only
3. **Single Key**: Only one API key supported (enhance for multi-tenant)
4. **No Encryption**: WebSocket data not encrypted (add TLS)

## 🔄 Regular Security Tasks

### Daily:
- Check container health status
- Review authentication logs
- Monitor resource usage

### Weekly:
- Update container if new security patches available
- Review API access patterns
- Check for failed login attempts

### Monthly:
- Rotate API keys
- Security scan of container images
- Review and update CORS origins
- Penetration testing

## 📞 Security Contact

Report security vulnerabilities to your system administrator.
Never post security issues in public repositories.