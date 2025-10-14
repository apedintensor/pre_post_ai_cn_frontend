<template>
  <div class="flex align-items-center justify-content-center min-h-screen px-4 py-8">
    <div class="signup-container">
      <Toast />
      <Card class="surface-card shadow-2 border-round p-4">
        <template #title>
          <div class="text-center mb-5">
            <div class="text-900 text-3xl font-medium mb-3">创建账号</div>
          </div>
        </template>
        <template #content>
          <form @submit.prevent="handleSignup" class="p-fluid">
            <div class="grid form-grid">
              <!-- Email Field -->
              <div class="col-12">
                <label for="email" class="field-label">邮箱</label>
                <div class="input-wrapper">
                  <i class="pi pi-envelope" />
                  <InputText
                    id="email"
                    v-model="formData.email"
                    placeholder="you@example.com"
                    class="w-full border-none shadow-none"
                    required
                  />
                </div>
              </div>

              <!-- Password Field -->
              <div class="col-12">
                <label for="password" class="field-label">密码</label>
                <div class="input-wrapper">
                  <i class="pi pi-lock" />
                  <Password
                    id="password"
                    v-model="formData.password"
                    placeholder="••••••••"
                    :toggleMask="true"
                    :feedback="true"
                    class="w-full border-none shadow-none"
                    required
                  />
                </div>
              </div>

              <!-- Age Field -->
              <div class="col-12 md:col-6">
                <label for="age" class="field-label with-icon"><i class="pi pi-user" /> 年龄</label>
                <InputNumber
                  id="age"
                  v-model="formData.age"
                  :min="0"
                  :max="120"
                  :step="1"
                  showButtons
                  class="w-full"
                  required
                />
              </div>

              <div class="col-12 md:col-6">
                <label for="exp" class="field-label with-icon"><i class="pi pi-briefcase" /> 临床工作年限</label>
                <InputNumber 
                  id="exp" 
                  v-model="formData.years_experience" 
                  :min="0" 
                  :step="1"
                  showButtons
                  class="w-full" 
                  required
                />
              </div>

              <div class="col-12 md:col-6">
                <label for="dermExp" class="field-label with-icon"><i class="pi pi-sparkles" /> 皮肤科从业年限</label>
                <InputNumber 
                  id="dermExp" 
                  v-model="formData.years_derm_experience" 
                  :min="0" 
                  :step="1"
                  showButtons
                  class="w-full" 
                  required
                />
              </div>

              <!-- Gender Field -->
              <div class="col-12 md:col-6">
                <label for="gender" class="field-label with-icon"><i class="pi pi-users" /> 性别</label>
                <Dropdown 
                  id="gender"
                  v-model="formData.gender"
                  :options="genderOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                  placeholder="选择性别"
                  :required="true"
                />
              </div>

              <div class="col-12 md:col-6">
                <label for="role" class="field-label with-icon"><i class="pi pi-id-card" /> 职业角色</label>
                <Dropdown 
                  id="role" 
                  v-model="formData.role_id" 
                  :options="roles" 
                  optionLabel="name" 
                  optionValue="id" 
                  class="w-full"
                  :loading="rolesLoading"
                  :disabled="rolesLoading || roles.length === 0"
                  placeholder="选择角色"
                  :required="roles.length > 0"
                />
              </div>

              <!-- Country Field -->
              <div class="col-12 md:col-6">
                <label for="country" class="field-label with-icon"><i class="pi pi-globe" /> 国家/地区</label>
                <Dropdown 
                  id="country"
                  v-model="formData.country_code"
                  :options="countries"
                  optionLabel="name"
                  optionValue="code"
                  class="w-full"
                  :loading="countriesLoading"
                  :disabled="countriesLoading || countries.length === 0"
                  placeholder="选择国家/地区"
                  filter
                  :required="countries.length > 0"
                />
                <small v-if="countriesLoading" class="u-text-muted">国家/地区加载中…</small>
                <div v-else-if="countries.length === 0" class="mt-1">
                  <small class="u-text-muted mr-2">国家/地区列表加载失败。</small>
                  <Button type="button" label="重试" size="small" text @click="retryCountries" />
                </div>
              </div>

              <div class="col-12">
                <Button 
                  type="submit" 
                  :label="loading ? '正在创建账号…' : '创建账号'" 
                  :loading="loading"
                  severity="primary"
                  class="w-full p-3 mt-2"
                />

                <div class="text-center mt-4">
                  <Divider align="center" class="auth-divider">
                    <span class="divider-label">已经有账号？</span>
                  </Divider>
                  <router-link to="/login" class="no-underline">
                    <Button 
                      type="button" 
                      label="去登录" 
                      severity="secondary" 
                      outlined
                      class="w-full p-3"
                    />
                  </router-link>
                </div>
              </div>
            </div>
          </form>
        </template>
      </Card>
    </div>
  </div>
</template>

<style>
/* Auth layout relies on body background tokens; no custom bg needed */
</style>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import InputNumber from 'primevue/inputnumber';
import Card from 'primevue/card';
import Toast from 'primevue/toast';
import Divider from 'primevue/divider';
import { useToast } from 'primevue/usetoast';
import apiClient from '../api';

// Define Role interface based on RoleRead schema
interface Role {
    id: number;
    name: string;
}

const router = useRouter();
const toast = useToast();

const formData = reactive({
  email: '',
  password: '',
  age_bracket: null as string | null,
  age: null as number | null, // raw age captured from user (not sent directly to backend)
  years_experience: null as number | null,
  years_derm_experience: null as number | null,
  role_id: null as number | null,
  country_code: null as string | null,
  gender: null as string | null,
});

const loading = ref(false);
const rolesLoading = ref(false); // Loading state for roles dropdown
const roles = ref<Role[]>([]); // To store fetched roles
const countriesLoading = ref(false);
interface Country { code: string; name: string; }
const countries = ref<Country[]>([]);

// Gender options — restricted per backend: Male, Female, Other
const genderOptions = [
  { label: '男', value: 'Male' },
  { label: '女', value: 'Female' },
  { label: '其他', value: 'Other' }
];

// (gender field removed)

function normalizeCountries(data: any): Country[] {
  if (Array.isArray(data)) {
    // Expecting array of { code, name }
    return data as Country[];
  }
  if (data && typeof data === 'object') {
    // Map form: { "AU": "Australia", ... }
    return Object.entries(data).map(([code, name]) => ({ code, name: String(name) }));
  }
  return [];
}

// Fetch roles and countries when the component mounts (independent so one failure doesn't block the other)
onMounted(async () => {
  rolesLoading.value = true;
  countriesLoading.value = true;
  try {
    const [rolesRes, countriesRes] = await Promise.allSettled([
      apiClient.get<Role[]>('/api/roles/'),
      apiClient.get('/api/countries/')
    ]);

    // Roles result handling
    if (rolesRes.status === 'fulfilled') {
      roles.value = rolesRes.value.data;
    } else {
      console.warn('Failed to fetch roles:', rolesRes.reason);
  toast.add({ severity: 'warn', summary: '角色', detail: '无法加载角色列表。', life: 2500 });
    }

    // Countries result handling with fallback to /countries (no /api) if needed
    if (countriesRes.status === 'fulfilled') {
      countries.value = normalizeCountries(countriesRes.value.data);
      // Default to China if available and user hasn't chosen yet
      if (!formData.country_code) {
        const cn = countries.value.find(c => c.code === 'CN');
        if (cn) formData.country_code = cn.code;
      }
    } else {
  console.warn('Failed to fetch /api/countries, trying /countries ...', countriesRes.reason);
      try {
        const fallback = await apiClient.get('/countries');
        countries.value = normalizeCountries(fallback.data);
        if (!formData.country_code) {
          const cn = countries.value.find(c => c.code === 'CN');
          if (cn) formData.country_code = cn.code;
        }
      } catch (fallbackErr) {
  console.warn('Failed to fetch countries fallback:', fallbackErr);
  toast.add({ severity: 'warn', summary: '国家/地区', detail: '无法加载国家/地区列表。', life: 2500 });
      }
    }
  } finally {
    rolesLoading.value = false;
    countriesLoading.value = false;
  }
});

async function retryCountries(){
  countriesLoading.value = true;
  try {
    const res = await apiClient.get('/api/countries/');
    countries.value = normalizeCountries(res.data);
    if (!formData.country_code) {
      const cn = countries.value.find(c => c.code === 'CN');
      if (cn) formData.country_code = cn.code;
    }
  } catch (err) {
    try {
      const fb = await apiClient.get('/countries');
      countries.value = normalizeCountries(fb.data);
      if (!formData.country_code) {
        const cn = countries.value.find(c => c.code === 'CN');
        if (cn) formData.country_code = cn.code;
      }
    } catch (e) {
  toast.add({ severity:'warn', summary:'国家/地区', detail:'重试失败，请稍后再试。', life:2500 });
    }
  } finally {
    countriesLoading.value = false;
  }
}

const handleSignup = async () => {
  loading.value = true;
  try {
    // Ensure required fields are not null before sending
    const numericAge = formData.age;
    if (numericAge === null || Number.isNaN(numericAge)) {
      toast.add({ severity: 'warn', summary: '年龄', detail: '请输入年龄。', life: 3000 });
      loading.value = false;
      return;
    }
    if (numericAge < 0 || numericAge > 120) {
      toast.add({ severity: 'warn', summary: '年龄', detail: '请输入 0 到 120 之间的年龄。', life: 3000 });
      loading.value = false;
      return;
    }

    formData.age_bracket = String(Math.round(numericAge));

  const { email, password, age_bracket, years_experience, years_derm_experience, role_id, country_code, gender } = formData;

    if (!age_bracket) {
      toast.add({ severity: 'warn', summary: '年龄', detail: '请输入有效年龄。', life: 3000 });
      loading.value = false;
      return;
    }

    const payload = {
      email,
      password,
      age_bracket,
      years_experience,
      years_derm_experience,
      role_id,
      country_code,
      gender,
      // FastAPI Users expects these defaults, but we provide them
      is_active: true,
      is_superuser: false,
      is_verified: false, // Assuming verification is handled separately
    };

    // Use the correct endpoint from openapi.json
    await apiClient.post('/api/auth/register', payload);

  toast.add({ severity: 'success', summary: '注册成功', detail: '请登录。', life: 3000 });
    router.push('/login');

  } catch (error: any) {
    console.error("Signup error:", error);
  let detail = '注册失败，请检查输入内容。';
    if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
            // Handle simple string errors like "REGISTER_USER_ALREADY_EXISTS"
            detail = error.response.data.detail.replace(/_/g, ' ');
        } else if (Array.isArray(error.response.data.detail)) {
            // Handle FastAPI validation errors (HTTP 422)
            detail = error.response.data.detail.map((err: any) => `${err.loc.join('.')} - ${err.msg}`).join('；');
        } else if (typeof error.response.data.detail === 'object' && error.response.data.detail.code === 'REGISTER_INVALID_PASSWORD') {
             // Handle specific password error structure
             detail = `密码不符合要求：${error.response.data.detail.reason}`;
        } else if (typeof error.response.data.detail === 'object') {
             // Fallback for other object details
             detail = JSON.stringify(error.response.data.detail);
        }
    }
  toast.add({ severity: 'error', summary: '注册失败', detail: detail, life: 5000 });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.signup-container {
  width: 100%;
  max-width: 600px;
}

.form-grid { row-gap: 1.25rem; }

.field-label { display:block; font-weight:600; margin-bottom:.4rem; font-size:.85rem; letter-spacing:.3px; }
.field-label.with-icon i { margin-right:.4rem; font-size:.85rem; opacity:.8; }

.input-wrapper { display:flex; align-items:center; gap:.65rem; padding:.75rem .9rem; background:var(--auth-input-bg, var(--surface-overlay)); border:1px solid var(--auth-input-border, var(--surface-border)); border-radius:var(--border-radius); transition:border-color .15s, box-shadow .15s, background-color .3s; }
.input-wrapper i { color:var(--text-color-secondary); font-size:1rem; }
/* Enhanced focus style: clearer border instead of external outline */
.input-wrapper:focus-within { border-color: var(--primary-color); box-shadow:0 0 0 1px var(--primary-color/30); }

:deep(.p-card) {
  background: var(--surface-card);
  border-radius: var(--border-radius);
}

:deep(.p-inputnumber-input) {
  width: 100%;
}

:deep(.p-password),
:deep(.p-dropdown) {
  width: 100%;
}

:deep(.p-inputnumber),
:deep(.p-inputnumber-input) { width:100%; }

:deep(.p-dropdown),
:deep(.p-password),
:deep(.p-inputnumber) { background: var(--auth-input-bg, var(--surface-overlay)); }

/* Divider refinement (mirror login) */
.auth-divider { margin-top:1rem; }
.divider-label { background: var(--surface-card, var(--auth-surface-bg)); padding:0 .6rem; font-size:.75rem; font-weight:500; color:var(--text-color-secondary); border-radius:2px; position:relative; z-index:1; }
:deep(.auth-divider .p-divider-content){ background: var(--surface-card, var(--auth-surface-bg))!important; padding:0 .25rem; position:relative; z-index:1; }
:deep(.auth-divider.p-divider-horizontal:before),
:deep(.auth-divider.p-divider-horizontal:after){ border-top:1px solid var(--surface-border); }

@media (prefers-color-scheme: dark){
  :root { --auth-input-bg:#262e38; --auth-input-border:#3b4754; }
}
@media (prefers-color-scheme: light){
  :root { --auth-input-bg:#f3f5f7; --auth-input-border:#c3ccd5; }
}

@media screen and (max-width: 576px) {
  .signup-container {
    max-width: 100%;
  }
}
</style>