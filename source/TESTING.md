Run from the repository root: npm ci --prefix source/tests
Then: node --test source/tests/*.test.cjs
Tests use mocked backend services and do not alter live listings.
