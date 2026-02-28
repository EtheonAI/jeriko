use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use obfstr::obfstr;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::types::{LicensePayload, PlanLimits};

// ── Machine ID ──────────────────────────────────────────────────────────────

/// Compute a deterministic machine ID from hostname + username + platform.
/// Returns a SHA-256 hex string.
pub fn compute_machine_id() -> String {
    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    let platform = std::env::consts::OS;

    let mut hasher = Sha256::new();
    hasher.update(host.as_bytes());
    hasher.update(user.as_bytes());
    hasher.update(platform.as_bytes());
    let result = hasher.finalize();

    hex_encode(&result)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// ── Ed25519 Public Key ──────────────────────────────────────────────────────

/// Get the Ed25519 public key bytes.
/// The key is obfuscated at compile time via `obfstr!()` — stored encrypted
/// in the binary, decrypted on the stack at runtime.
///
/// Currently all-zeros: dev placeholder. When a real key is provisioned,
/// replace the hex string and verification will activate automatically.
fn get_public_key_bytes() -> [u8; 32] {
    // obfstr encrypts this string at compile time; it only exists in
    // plaintext on the stack during this function call.
    let key_hex = obfstr!(
        "0000000000000000000000000000000000000000000000000000000000000000"
    )
    .to_string();
    hex_decode_32(&key_hex)
}

/// Returns true if the embedded public key is the all-zeros dev placeholder.
fn is_dev_key(key_bytes: &[u8; 32]) -> bool {
    key_bytes.iter().all(|&b| b == 0)
}

fn hex_decode_32(hex: &str) -> [u8; 32] {
    let mut out = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks(2).enumerate() {
        if i >= 32 {
            break;
        }
        let high = hex_nibble(chunk[0]);
        let low = hex_nibble(chunk[1]);
        out[i] = (high << 4) | low;
    }
    out
}

fn hex_nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => 0,
    }
}

// ── License Validation ──────────────────────────────────────────────────────

/// Validate a license JWT and return the plan limits.
///
/// On ANY failure, returns `PlanLimits::free()` — graceful degradation,
/// never crashes. This ensures the app always works, just with limited
/// concurrency for unlicensed/invalid users.
pub fn validate_license(license_key: &Option<String>, machine_id: &str) -> PlanLimits {
    let key = match license_key {
        Some(k) if !k.is_empty() => k,
        _ => return PlanLimits::free(),
    };

    match validate_jwt(key, machine_id) {
        Ok(limits) => limits,
        Err(_) => PlanLimits::free(),
    }
}

fn validate_jwt(token: &str, machine_id: &str) -> Result<PlanLimits, LicenseError> {
    // Split into 3 parts: header.payload.signature
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(LicenseError::MalformedToken);
    }

    let header_part = parts[0];
    let payload_part = parts[1];
    let signature_part = parts[2];

    // Decode payload
    let payload_bytes = base64_decode(payload_part)?;
    let payload: LicensePayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| LicenseError::InvalidPayload)?;

    // Check expiry
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if payload.exp <= now {
        return Err(LicenseError::Expired);
    }

    // Check machine binding
    if let Some(ref bound_id) = payload.machine_id {
        if bound_id != machine_id {
            return Err(LicenseError::MachineMismatch);
        }
    }

    // Check issuer
    match &payload.iss {
        Some(iss) if iss == "jeriko.ai" => {}
        Some(_) => return Err(LicenseError::InvalidIssuer),
        None => return Err(LicenseError::InvalidIssuer),
    }

    // Verify Ed25519 signature
    let pub_key_bytes = get_public_key_bytes();
    if !is_dev_key(&pub_key_bytes) {
        let verifying_key = VerifyingKey::from_bytes(&pub_key_bytes)
            .map_err(|_| LicenseError::InvalidKey)?;

        let signature_bytes = base64_decode(signature_part)?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| LicenseError::InvalidSignature)?;

        let signed_content = format!("{}.{}", header_part, payload_part);
        verifying_key
            .verify(signed_content.as_bytes(), &signature)
            .map_err(|_| LicenseError::SignatureInvalid)?;
    }
    // Dev key (all zeros): skip signature verification

    Ok(PlanLimits::from_plan(&payload.plan))
}

/// Try standard base64 first, then URL-safe-no-pad as fallback.
fn base64_decode(input: &str) -> Result<Vec<u8>, LicenseError> {
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .or_else(|_| {
            base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(input)
        })
        .map_err(|_| LicenseError::Base64Error)
}

#[derive(Debug)]
enum LicenseError {
    MalformedToken,
    Base64Error,
    InvalidPayload,
    Expired,
    MachineMismatch,
    InvalidIssuer,
    InvalidKey,
    InvalidSignature,
    SignatureInvalid,
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    #[test]
    fn test_machine_id_deterministic() {
        let id1 = compute_machine_id();
        let id2 = compute_machine_id();
        assert_eq!(id1, id2);
        assert_eq!(id1.len(), 64); // SHA-256 hex = 64 chars
    }

    #[test]
    fn test_machine_id_is_hex() {
        let id = compute_machine_id();
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_no_license_returns_free() {
        let limits = validate_license(&None, "test-machine");
        assert_eq!(limits.plan, "free");
        assert_eq!(limits.max_subtasks, 5);
        assert_eq!(limits.max_concurrent, 2);
    }

    #[test]
    fn test_empty_license_returns_free() {
        let limits = validate_license(&Some("".to_string()), "test-machine");
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_malformed_token_returns_free() {
        let limits = validate_license(&Some("not-a-jwt".to_string()), "test-machine");
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_invalid_base64_returns_free() {
        let limits = validate_license(&Some("a.!!!.c".to_string()), "test-machine");
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_expired_token_returns_free() {
        // Build a JWT with exp in the past (dev key = no sig verification)
        let machine_id = compute_machine_id();
        let payload = serde_json::json!({
            "sub": "test-user",
            "plan": "pro",
            "max_subtasks": 10,
            "max_concurrent": 4,
            "exp": 1000, // long expired
            "machine_id": machine_id,
            "iss": "jeriko.ai"
        });
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string().as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(b"fake-sig");
        let token = format!("{}.{}.{}", header, payload_b64, sig);

        let limits = validate_license(&Some(token), &machine_id);
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_machine_mismatch_returns_free() {
        let payload = serde_json::json!({
            "sub": "test-user",
            "plan": "pro",
            "max_subtasks": 10,
            "max_concurrent": 4,
            "exp": 9999999999u64,
            "machine_id": "wrong-machine-id",
            "iss": "jeriko.ai"
        });
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string().as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(b"fake-sig");
        let token = format!("{}.{}.{}", header, payload_b64, sig);

        let limits = validate_license(&Some(token), "my-actual-machine");
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_wrong_issuer_returns_free() {
        let machine_id = compute_machine_id();
        let payload = serde_json::json!({
            "sub": "test-user",
            "plan": "pro",
            "max_subtasks": 10,
            "max_concurrent": 4,
            "exp": 9999999999u64,
            "machine_id": machine_id,
            "iss": "evil.com"
        });
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string().as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(b"fake-sig");
        let token = format!("{}.{}.{}", header, payload_b64, sig);

        let limits = validate_license(&Some(token), &machine_id);
        assert_eq!(limits.plan, "free");
    }

    #[test]
    fn test_valid_pro_token_dev_key() {
        // With all-zeros dev key, signature is not verified
        let machine_id = compute_machine_id();
        let payload = serde_json::json!({
            "sub": "test-user",
            "plan": "pro",
            "max_subtasks": 10,
            "max_concurrent": 4,
            "exp": 9999999999u64,
            "machine_id": machine_id,
            "iss": "jeriko.ai"
        });
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string().as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(b"fake-sig");
        let token = format!("{}.{}.{}", header, payload_b64, sig);

        let limits = validate_license(&Some(token), &machine_id);
        assert_eq!(limits.plan, "pro");
        assert_eq!(limits.max_subtasks, 10);
        assert_eq!(limits.max_concurrent, 4);
    }

    #[test]
    fn test_valid_enterprise_token_dev_key() {
        let machine_id = compute_machine_id();
        let payload = serde_json::json!({
            "sub": "corp-user",
            "plan": "enterprise",
            "max_subtasks": 50,
            "max_concurrent": 8,
            "exp": 9999999999u64,
            "machine_id": machine_id,
            "iss": "jeriko.ai"
        });
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string().as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(b"fake-sig");
        let token = format!("{}.{}.{}", header, payload_b64, sig);

        let limits = validate_license(&Some(token), &machine_id);
        assert_eq!(limits.plan, "enterprise");
        assert_eq!(limits.max_subtasks, 50);
    }

    #[test]
    fn test_hex_encode() {
        assert_eq!(hex_encode(&[0xde, 0xad, 0xbe, 0xef]), "deadbeef");
    }

    #[test]
    fn test_hex_decode_32() {
        let hex = "deadbeef00000000000000000000000000000000000000000000000000000000";
        let bytes = hex_decode_32(hex);
        assert_eq!(bytes[0], 0xde);
        assert_eq!(bytes[1], 0xad);
        assert_eq!(bytes[2], 0xbe);
        assert_eq!(bytes[3], 0xef);
        assert_eq!(bytes[4], 0x00);
    }

    #[test]
    fn test_is_dev_key() {
        assert!(is_dev_key(&[0u8; 32]));
        let mut non_zero = [0u8; 32];
        non_zero[0] = 1;
        assert!(!is_dev_key(&non_zero));
    }
}
