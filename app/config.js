/*
 * Browser-safe project configuration.
 *
 * Only a Supabase project URL and publishable key belong here. Never add a
 * service_role key, database password, JWT signing secret, or storage secret.
 * Empty values keep the Trust Lab in Local Preview mode.
 */
window.VAULT_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: '',
});
