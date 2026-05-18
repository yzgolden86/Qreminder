package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func serveTestRequest(t *testing.T, app core.App, method string, target string, body string, token string) *httptest.ResponseRecorder {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	registerRoutes(app, router)
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(method, target, bytes.NewBufferString(body))
	req.Header.Set("content-type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func serveMultipartTestRequest(t *testing.T, app core.App, target string, token string, fields map[string]string, fileField string, filename string, content string) *httptest.ResponseRecorder {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	registerRoutes(app, router)
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile(fileField, filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, target, &body)
	req.Header.Set("content-type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func createRouteTestUser(t *testing.T, app core.App, role string) (*core.Record, string) {
	t.Helper()
	user, err := createUser(app, "Admin", "admin-"+role+"@example.com", "password123", role)
	if err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return user, token
}

func createRouteTestSuperuser(t *testing.T, app core.App, email string, password string) *core.Record {
	t.Helper()
	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal(err)
	}
	superuser := core.NewRecord(superusers)
	superuser.SetEmail(email)
	superuser.SetPassword(password)
	if err := app.Save(superuser); err != nil {
		t.Fatal(err)
	}
	return superuser
}

func TestSetupRouteHonorsSetupEnabledAndCreatedStatus(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}

	t.Setenv("SETUP_ENABLED", "false")
	res := serveTestRequest(t, app, http.MethodGet, "/api/app/setup", "", "")
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"setupEnabled":false`) {
		t.Fatalf("unexpected setup status response %d: %s", res.Code, res.Body.String())
	}

	res = serveTestRequest(t, app, http.MethodPost, "/api/app/setup", `{"name":"Admin","email":"admin@example.com","password":"password123"}`, "")
	if res.Code != http.StatusForbidden {
		t.Fatalf("expected disabled setup to be forbidden, got %d: %s", res.Code, res.Body.String())
	}

	t.Setenv("SETUP_ENABLED", "true")
	res = serveTestRequest(t, app, http.MethodPost, "/api/app/setup", `{"name":"Admin","email":"admin@example.com","password":"password123"}`, "")
	if res.Code != http.StatusCreated {
		t.Fatalf("expected setup create status 201, got %d: %s", res.Code, res.Body.String())
	}

	admin, err := app.FindAuthRecordByEmail("users", "admin@example.com")
	if err != nil {
		t.Fatalf("expected setup admin user: %v", err)
	}
	if admin.GetString("role") != "admin" {
		t.Fatalf("expected setup user role admin, got %q", admin.GetString("role"))
	}
	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "admin@example.com")
	if err != nil {
		t.Fatalf("expected setup superuser: %v", err)
	}
	if !superuser.ValidatePassword("password123") {
		t.Fatal("expected setup superuser password to match setup password")
	}
}

func TestSetupRouteDoesNotOverwriteExistingSuperuser(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	createRouteTestSuperuser(t, app, "pb-admin@example.com", "oldpassword123")

	res := serveTestRequest(t, app, http.MethodPost, "/api/app/setup", `{"name":"Admin","email":"admin@example.com","password":"password123"}`, "")
	if res.Code != http.StatusCreated {
		t.Fatalf("expected setup create status 201, got %d: %s", res.Code, res.Body.String())
	}

	existing, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "pb-admin@example.com")
	if err != nil {
		t.Fatalf("expected existing superuser: %v", err)
	}
	if !existing.ValidatePassword("oldpassword123") {
		t.Fatal("expected existing superuser password to remain unchanged")
	}
	if _, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "admin@example.com"); err == nil {
		t.Fatal("expected setup to skip creating a second superuser when one already exists")
	}
	if _, err := app.FindAuthRecordByEmail("users", "admin@example.com"); err != nil {
		t.Fatalf("expected setup admin user to still be created: %v", err)
	}
}

func TestAssetsCollectionCreateAcceptsSvgUpload(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, token := createRouteTestUser(t, app, "authenticated")

	res := serveMultipartTestRequest(
		t,
		app,
		"/api/collections/assets/records",
		token,
		map[string]string{
			"user": user.Id,
			"kind": "logo",
		},
		"file",
		"logo.svg",
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>`,
	)

	if res.Code != http.StatusOK {
		t.Fatalf("expected SVG asset create 200, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		MimeType string `json:"mimeType"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.MimeType != "image/svg+xml" {
		t.Fatalf("mimeType = %q, want image/svg+xml", body.MimeType)
	}
}

func TestSubscriptionsCollectionCreateAcceptsPrivateAssetLogoPath(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, token := createRouteTestUser(t, app, "authenticated")

	uploadRes := serveMultipartTestRequest(
		t,
		app,
		"/api/collections/assets/records",
		token,
		map[string]string{
			"user": user.Id,
			"kind": "logo",
		},
		"file",
		"logo.svg",
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>`,
	)
	if uploadRes.Code != http.StatusOK {
		t.Fatalf("expected SVG asset create 200, got %d: %s", uploadRes.Code, uploadRes.Body.String())
	}
	var uploadBody struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(uploadRes.Body.Bytes(), &uploadBody); err != nil {
		t.Fatal(err)
	}
	if uploadBody.ID == "" {
		t.Fatalf("expected uploaded asset id: %s", uploadRes.Body.String())
	}

	logoPath := "/api/app/assets/" + uploadBody.ID
	createRes := serveTestRequest(
		t,
		app,
		http.MethodPost,
		"/api/collections/subscriptions/records",
		fmt.Sprintf(`{
			"user":%q,
			"name":"test",
			"logo":%q,
			"price":0.83,
			"currency":"CNY",
			"billingCycle":"monthly",
			"customDays":null,
			"category":"productivity",
			"status":"active",
			"paymentMethod":null,
			"startDate":"2026-05-15",
			"nextBillingDate":"2026-06-15",
			"autoCalculateNextBillingDate":true,
			"trialEndDate":null,
			"website":null,
			"notes":null,
			"tags":[],
			"reminderOffsets":[3]
		}`, user.Id, logoPath),
		token,
	)
	if createRes.Code != http.StatusOK {
		t.Fatalf("expected subscription create 200, got %d: %s", createRes.Code, createRes.Body.String())
	}
	var createBody struct {
		Logo string `json:"logo"`
	}
	if err := json.Unmarshal(createRes.Body.Bytes(), &createBody); err != nil {
		t.Fatal(err)
	}
	if createBody.Logo != logoPath {
		t.Fatalf("subscription logo = %q, want %q", createBody.Logo, logoPath)
	}
}

func TestSetupRouteRejectsStrictJSONViolations(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		body string
	}{
		{
			name: "unknown field",
			body: `{"name":"Admin","email":"admin@example.com","password":"password123","extra":true}`,
		},
		{
			name: "multiple json values",
			body: `{"name":"Admin","email":"admin@example.com","password":"password123"} {}`,
		},
		{
			name: "empty body",
			body: ``,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := serveTestRequest(t, app, http.MethodPost, "/api/app/setup", tc.body, "")
			if res.Code != http.StatusBadRequest {
				t.Fatalf("expected setup strict JSON violation to return 400, got %d: %s", res.Code, res.Body.String())
			}
		})
	}
}

func TestSetupRouteIgnoresPocketBaseInstallerSuperuser(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	createRouteTestSuperuser(t, app, core.DefaultInstallerEmail, "installerpassword123")

	res := serveTestRequest(t, app, http.MethodPost, "/api/app/setup", `{"name":"Admin","email":"admin@example.com","password":"password123"}`, "")
	if res.Code != http.StatusCreated {
		t.Fatalf("expected setup create status 201, got %d: %s", res.Code, res.Body.String())
	}

	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "admin@example.com")
	if err != nil {
		t.Fatalf("expected real setup superuser: %v", err)
	}
	if !superuser.ValidatePassword("password123") {
		t.Fatal("expected real setup superuser password to match setup password")
	}
}

func TestAdminUsersRouteReturnsManagementContract(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, token := createRouteTestUser(t, app, "admin")

	res := serveTestRequest(t, app, http.MethodGet, "/api/app/admin/users", "", token)
	body := res.Body.String()
	if res.Code != http.StatusOK {
		t.Fatalf("expected users 200, got %d: %s", res.Code, body)
	}
	for _, expected := range []string{`"users"`, `"role":"admin"`, `"createdAt"`, `"updatedAt"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("missing %s in response: %s", expected, body)
		}
	}
}

func TestAdminPatchUserRejectsStrictJSONViolations(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, token := createRouteTestUser(t, app, "admin")
	editable, _ := createRouteTestUser(t, app, "user")

	cases := []struct {
		name string
		body string
	}{
		{name: "unknown field", body: `{"banned":false,"extra":true}`},
		{name: "empty object", body: `{}`},
		{name: "invalid role", body: `{"role":"owner"}`},
		{name: "short password", body: `{"newPassword":"short"}`},
		{name: "multiple json values", body: `{"banned":false} {}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := serveTestRequest(t, app, http.MethodPatch, "/api/app/admin/users/"+editable.Id, tc.body, token)
			if res.Code != http.StatusBadRequest {
				t.Fatalf("expected admin patch strict JSON violation to return 400, got %d: %s", res.Code, res.Body.String())
			}
		})
	}
}

func TestFaviconSearchRequiresAuthAndCanServeCachedResult(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, token := createRouteTestUser(t, app, "user")

	res := serveTestRequest(t, app, http.MethodGet, "/api/app/favicon-search?search=netflix", "", "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected favicon search 401, got %d: %s", res.Code, res.Body.String())
	}

	setFaviconCache("logo:netflix", []string{"https://netflix.com/favicon.ico"})
	res = serveTestRequest(t, app, http.MethodGet, "/api/app/favicon-search?search=netflix", "", token)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "https://netflix.com/favicon.ico") {
		t.Fatalf("unexpected cached favicon response %d: %s", res.Code, res.Body.String())
	}
}

func TestTheSvgRouteValidatesQueryAndSetsPrivateCache(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}

	res := serveTestRequest(t, app, http.MethodGet, "/api/app/thesvg-icons", "", "")
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected missing query 400, got %d: %s", res.Code, res.Body.String())
	}

	res = serveTestRequest(t, app, http.MethodGet, "/api/app/thesvg-icons?search="+strings.Repeat("a", 81), "", "")
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected long query 400, got %d: %s", res.Code, res.Body.String())
	}

	res = serveTestRequest(t, app, http.MethodGet, "/api/app/thesvg-icons?search=dmit", "", "")
	if res.Code != http.StatusOK {
		t.Fatalf("expected dmit thesvg 200, got %d: %s", res.Code, res.Body.String())
	}
	var emptyBody struct {
		Icons []apiTheSvgIcon `json:"icons"`
	}
	if err := json.NewDecoder(res.Body).Decode(&emptyBody); err != nil {
		t.Fatalf("failed to decode empty thesvg response: %v", err)
	}
	if len(emptyBody.Icons) != 0 {
		t.Fatalf("expected dmit to have no built-in icons, got %#v", emptyBody.Icons)
	}

	res = serveTestRequest(t, app, http.MethodGet, "/api/app/thesvg-icons?search=netflix&limit=1", "", "")
	if res.Code != http.StatusOK {
		t.Fatalf("expected thesvg 200, got %d: %s", res.Code, res.Body.String())
	}
	if cache := res.Header().Get("Cache-Control"); cache != "private, max-age=300" {
		t.Fatalf("unexpected cache-control %q", cache)
	}
	var netflixBody struct {
		Icons []apiTheSvgIcon `json:"icons"`
	}
	if err := json.NewDecoder(res.Body).Decode(&netflixBody); err != nil {
		t.Fatalf("failed to decode netflix thesvg response: %v", err)
	}
	if len(netflixBody.Icons) != 1 || netflixBody.Icons[0].Slug != "netflix" {
		t.Fatalf("expected netflix result, got %#v", netflixBody.Icons)
	}

	res = serveTestRequest(t, app, http.MethodGet, "/api/app/thesvg-icons?search=openai&limit=8", "", "")
	if res.Code != http.StatusOK {
		t.Fatalf("expected openai thesvg 200, got %d: %s", res.Code, res.Body.String())
	}
	var openaiBody struct {
		Icons []apiTheSvgIcon `json:"icons"`
	}
	if err := json.NewDecoder(res.Body).Decode(&openaiBody); err != nil {
		t.Fatalf("failed to decode openai thesvg response: %v", err)
	}
	foundOpenAI := false
	for _, icon := range openaiBody.Icons {
		if strings.Contains(strings.ToLower(icon.Title), "openai") || strings.Contains(strings.ToLower(icon.Slug), "openai") {
			foundOpenAI = true
			break
		}
	}
	if !foundOpenAI {
		t.Fatalf("expected openai result, got %#v", openaiBody.Icons)
	}
}

func TestNotificationHistoryRouteSortsByCreatedField(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	_, token := createRouteTestUser(t, app, "user")

	res := serveTestRequest(t, app, http.MethodGet, "/api/app/notifications/history?status=all&limit=5", "", token)
	if res.Code != http.StatusOK {
		t.Fatalf("expected notification history 200, got %d: %s", res.Code, res.Body.String())
	}
}
