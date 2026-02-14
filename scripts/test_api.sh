# Configuration
BASE_URL="https://localhost:3000"
COOKIE_FILE="cookies.txt"
USERNAME="curl_test_user"
PASSWORD="securepassword"
ROLE="manager"

echo "--- API Verification Test (Curl) ---"

# 1. Login as Admin
echo "1. Logging in as Admin..."
rm -f $COOKIE_FILE
curl -k -s -c $COOKIE_FILE -b $COOKIE_FILE \
  -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin", "password":"admin"}' > login_response.json

if grep -q "role" login_response.json; then
  echo "   [OK] Login successful"
else
  echo "   [FAIL] Login failed"
  cat login_response.json
  exit 1
fi

# 2. Create User
echo "2. Creating User '$USERNAME' with role '$ROLE'..."
curl -k -s -c $COOKIE_FILE -b $COOKIE_FILE \
  -X POST "$BASE_URL/api/admin/users" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\", \"password\":\"$PASSWORD\", \"role\":\"$ROLE\"}" > create_response.json

if grep -q "$USERNAME" create_response.json; then
  echo "   [OK] User created"
  USER_ID=$(grep -o '"id":"[^"]*' create_response.json | cut -d'"' -f4)
else
  echo "   [FAIL] User creation failed"
  cat create_response.json
  exit 1
fi

# 3. List Users
echo "3. Listing Users..."
curl -k -s -c $COOKIE_FILE -b $COOKIE_FILE \
  -X GET "$BASE_URL/api/admin/users?offset=0" > list_response.json

if grep -q "$USERNAME" list_response.json; then
  echo "   [OK] User '$USERNAME' found in list"
  if grep -q "$ROLE" list_response.json; then
      echo "   [OK] User has correct role '$ROLE'"
  else
      echo "   [WARN] User role verification failed (check output)"
  fi
else
  echo "   [FAIL] User '$USERNAME' NOT found in list"
  exit 1
fi

# 4. Sync Vector DB (Bonus Check)
echo "4. Testing Sync Vector DB Endpoint..."
curl -k -s -c $COOKIE_FILE -b $COOKIE_FILE \
  -X POST "$BASE_URL/api/admin/sync-vector-db" > sync_response.json

if grep -q "success" sync_response.json; then
    echo "   [OK] Sync endpoint working"
else
    echo "   [WARN] Sync endpoint failed (Expect 404 if server not restarted, or 500 if DB issue)"
    head -n 5 sync_response.json
fi


# 5. Delete User
echo "5. Deleting User '$USERNAME'..."
# Note: Delete endpoint usually uses username or ID depending on implementation. 
# Checking users.cjs: router.delete('/users/:username', ...)
curl -k -s -c $COOKIE_FILE -b $COOKIE_FILE \
  -X DELETE "$BASE_URL/api/admin/users/$USERNAME" > delete_response.json

if grep -q "success" delete_response.json; then
  echo "   [OK] User deleted"
else
  echo "   [FAIL] User deletion failed"
  cat delete_response.json
  exit 1
fi

echo "--- Test Complete ---"
rm $COOKIE_FILE login_response.json create_response.json list_response.json sync_response.json delete_response.json
