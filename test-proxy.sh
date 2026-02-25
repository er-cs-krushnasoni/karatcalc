#!/bin/bash

# Quick Proxy Test Script
# Save as test-proxy.sh and run: bash test-proxy.sh

echo "======================================"
echo "🧪 PROXY TEST SCRIPT"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if hidden frontend is running
echo "Test 1: Checking hidden frontend (port 5173)..."
if curl -s http://localhost:5173 > /dev/null; then
    echo -e "${GREEN}✅ Hidden frontend is running${NC}"
else
    echo -e "${RED}❌ Hidden frontend is NOT running${NC}"
    echo -e "${YELLOW}   Start it with: cd JEWELLERY-STOCK-MANAGEMENT-APP/frontend && npm run dev${NC}"
fi
echo ""

# Test 2: Check if hidden backend is running
echo "Test 2: Checking hidden backend (port 5000)..."
HEALTH_CHECK=$(curl -s http://localhost:5000/api/health)
if [ ! -z "$HEALTH_CHECK" ]; then
    echo -e "${GREEN}✅ Hidden backend is running${NC}"
    echo "   Response: $HEALTH_CHECK"
else
    echo -e "${RED}❌ Hidden backend is NOT running${NC}"
    echo -e "${YELLOW}   Start it with: cd JEWELLERY-STOCK-MANAGEMENT-APP/backend && npm start${NC}"
fi
echo ""

# Test 3: Check if hider is running
echo "Test 3: Checking hider project (port 8080)..."
if curl -s http://localhost:8080 > /dev/null; then
    echo -e "${GREEN}✅ Hider project is running${NC}"
else
    echo -e "${RED}❌ Hider project is NOT running${NC}"
    echo -e "${YELLOW}   Start it with: cd KARAT-GEM-VALUE-FINDER && npm run dev${NC}"
fi
echo ""

# Test 4: Check frontend proxy
echo "Test 4: Testing frontend proxy (/hidden-app)..."
PROXY_FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/hidden-app)
if [ "$PROXY_FRONTEND" == "200" ]; then
    echo -e "${GREEN}✅ Frontend proxy is working (HTTP $PROXY_FRONTEND)${NC}"
else
    echo -e "${RED}❌ Frontend proxy failed (HTTP $PROXY_FRONTEND)${NC}"
    echo -e "${YELLOW}   Check vite.config.ts proxy configuration${NC}"
fi
echo ""

# Test 5: Check backend proxy
echo "Test 5: Testing backend proxy (/hidden-api)..."
PROXY_BACKEND=$(curl -s http://localhost:8080/hidden-api/api/health)
if [ ! -z "$PROXY_BACKEND" ]; then
    echo -e "${GREEN}✅ Backend proxy is working${NC}"
    echo "   Response: $PROXY_BACKEND"
else
    echo -e "${RED}❌ Backend proxy failed${NC}"
    echo -e "${YELLOW}   Check vite.config.ts proxy configuration${NC}"
fi
echo ""

# Summary
echo "======================================"
echo "📊 TEST SUMMARY"
echo "======================================"
echo ""
echo "If all tests passed, your setup is correct!"
echo "Visit http://localhost:8080 and press 0+0= on calculator"
echo ""
echo "If any test failed, follow the yellow instructions above."
echo ""

# File checks
echo "======================================"
echo "📁 FILE CHECKS"
echo "======================================"
echo ""

cd KARAT-GEM-VALUE-FINDER 2>/dev/null || {
    echo -e "${RED}❌ Could not find KARAT-GEM-VALUE-FINDER directory${NC}"
    exit 1
}

# Check for old files that should be deleted
if [ -f "src/services/secureProxy.ts" ]; then
    echo -e "${RED}❌ WARNING: secureProxy.ts still exists - DELETE IT${NC}"
else
    echo -e "${GREEN}✅ secureProxy.ts deleted${NC}"
fi

if [ -f "src/components/ProxyInitializer.tsx" ]; then
    echo -e "${RED}❌ WARNING: ProxyInitializer.tsx still exists - DELETE IT${NC}"
else
    echo -e "${GREEN}✅ ProxyInitializer.tsx deleted${NC}"
fi

# Check for new files that should exist
if [ -f "src/utils/consoleSuppressor.ts" ]; then
    echo -e "${GREEN}✅ consoleSuppressor.ts exists${NC}"
else
    echo -e "${RED}❌ consoleSuppressor.ts missing - ADD IT${NC}"
fi

if [ -f "src/components/SecureFrame.tsx" ]; then
    echo -e "${GREEN}✅ SecureFrame.tsx exists${NC}"
else
    echo -e "${RED}❌ SecureFrame.tsx missing${NC}"
fi

# Check for bad imports
echo ""
echo "Checking for old imports..."
if grep -r "secureProxy" src/ 2>/dev/null | grep -v "Binary"; then
    echo -e "${RED}❌ Found secureProxy imports - REMOVE THEM${NC}"
else
    echo -e "${GREEN}✅ No secureProxy imports${NC}"
fi

if grep -r "ProxyInitializer" src/ 2>/dev/null | grep -v "Binary"; then
    echo -e "${RED}❌ Found ProxyInitializer imports - REMOVE THEM${NC}"
else
    echo -e "${GREEN}✅ No ProxyInitializer imports${NC}"
fi

echo ""
echo "======================================"
echo "✅ CHECKS COMPLETE"
echo "======================================"