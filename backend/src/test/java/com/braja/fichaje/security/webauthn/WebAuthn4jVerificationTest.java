package com.braja.fichaje.security.webauthn;

import com.braja.fichaje.security.webauthn.SoftwareAuthenticator.Assertion;
import com.braja.fichaje.security.webauthn.SoftwareAuthenticator.Attestation;
import com.braja.fichaje.security.webauthn.SoftwareAuthenticator.Ceremony;
import com.braja.fichaje.security.webauthn.SoftwareAuthenticator.Credential;
import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.credential.CredentialRecord;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticationRequest;
import com.webauthn4j.data.PublicKeyCredentialParameters;
import com.webauthn4j.data.PublicKeyCredentialType;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.RegistrationRequest;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.attestation.statement.COSEAlgorithmIdentifier;
import com.webauthn4j.data.attestation.statement.NoneAttestationStatement;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;
import com.webauthn4j.verifier.attestation.statement.none.NoneAttestationStatementVerifier;
import com.webauthn4j.verifier.attestation.trustworthiness.certpath.NullCertPathTrustworthinessVerifier;
import com.webauthn4j.verifier.attestation.trustworthiness.self.NullSelfAttestationTrustworthinessVerifier;
import com.webauthn4j.verifier.exception.BadChallengeException;
import com.webauthn4j.verifier.exception.BadOriginException;
import com.webauthn4j.verifier.exception.BadRpIdException;
import com.webauthn4j.verifier.exception.BadSignatureException;
import com.webauthn4j.verifier.exception.MaliciousCounterValueException;
import com.webauthn4j.verifier.exception.UserNotVerifiedException;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.braja.fichaje.security.webauthn.SoftwareAuthenticator.FLAG_BE;
import static com.braja.fichaje.security.webauthn.SoftwareAuthenticator.FLAG_BS;
import static com.braja.fichaje.security.webauthn.SoftwareAuthenticator.FLAG_UP;
import static com.braja.fichaje.security.webauthn.SoftwareAuthenticator.FLAG_UV;
import static com.braja.fichaje.security.webauthn.SoftwareAuthenticator.base64Url;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Issue #190 spike (D-20261114-01): WebAuthn4J verifies, on the server, a passkey registration and the assertion that
 * confirms each employee mark, with user verification required. Test scope only; no Spring, no database.
 */
class WebAuthn4jVerificationTest {
    private static final String RP_ID = "fichaje.example";
    private static final String ORIGIN = "https://fichaje.example";
    private static final List<PublicKeyCredentialParameters> ES256_ONLY = List.of(
            new PublicKeyCredentialParameters(PublicKeyCredentialType.PUBLIC_KEY, COSEAlgorithmIdentifier.ES256));
    private static final boolean USER_VERIFICATION_REQUIRED = true;
    private static final boolean USER_PRESENCE_REQUIRED = true;

    // Only the "none" attestation format is accepted; no attestation trust anchors are configured.
    private final WebAuthnManager manager = new WebAuthnManager(
            List.of(new NoneAttestationStatementVerifier()),
            new NullCertPathTrustworthinessVerifier(),
            new NullSelfAttestationTrustworthinessVerifier());
    private final SingleUseChallenges challenges = new SingleUseChallenges();

    @Test
    void aRegistrationAndAnAuthenticationWithUserVerificationAreAccepted() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] challenge = challenges.issue();
        AuthenticationData data = verify(record, SoftwareAuthenticator.authenticate(passkey, ceremony(challenge)), challenge);

        assertThat(data.getCredentialId()).isEqualTo(passkey.id());
        assertThat(data.getAuthenticatorData().isFlagUV()).isTrue();
        assertThat(data.getAuthenticatorData().isFlagUP()).isTrue();
    }

    @Test
    void theJsonThePwaSendsIsParsedAndVerifiedForRegistrationAndAuthentication() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        byte[] registrationChallenge = challenges.issue();
        Attestation attestation = SoftwareAuthenticator.register(passkey, ceremony(registrationChallenge));
        String registrationJson = "{\"id\":\"" + base64Url(passkey.id()) + "\",\"rawId\":\"" + base64Url(passkey.id())
                + "\",\"type\":\"public-key\",\"authenticatorAttachment\":\"platform\",\"clientExtensionResults\":{},"
                + "\"response\":{\"clientDataJSON\":\"" + base64Url(attestation.clientDataJson())
                + "\",\"attestationObject\":\"" + base64Url(attestation.attestationObject())
                + "\",\"transports\":[\"internal\",\"hybrid\"]}}";

        RegistrationData registration = manager.verifyRegistrationResponseJSON(registrationJson,
                new RegistrationParameters(server(registrationChallenge), ES256_ONLY,
                        USER_VERIFICATION_REQUIRED, USER_PRESENCE_REQUIRED));
        CredentialRecord record = toRecord(registration);

        byte[] challenge = challenges.issue();
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge));
        String authenticationJson = "{\"id\":\"" + base64Url(passkey.id()) + "\",\"rawId\":\"" + base64Url(passkey.id())
                + "\",\"type\":\"public-key\",\"authenticatorAttachment\":\"platform\",\"clientExtensionResults\":{},"
                + "\"response\":{\"clientDataJSON\":\"" + base64Url(assertion.clientDataJson())
                + "\",\"authenticatorData\":\"" + base64Url(assertion.authenticatorData())
                + "\",\"signature\":\"" + base64Url(assertion.signature()) + "\"}}";

        AuthenticationData data = manager.verifyAuthenticationResponseJSON(authenticationJson,
                new AuthenticationParameters(server(challenge), record, List.of(passkey.id()),
                        USER_VERIFICATION_REQUIRED, USER_PRESENCE_REQUIRED));
        assertThat(data.getCredentialId()).isEqualTo(passkey.id());
    }

    @Test
    void aCredentialStoredAsBytesAndReadBackStillVerifiesAnAssertion() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord registered = register(passkey);
        AttestedCredentialDataConverter converter = new AttestedCredentialDataConverter(new ObjectConverter());

        byte[] stored = converter.convert(registered.getAttestedCredentialData());
        AttestedCredentialData readBack = converter.convert(stored);
        CredentialRecord record = new CredentialRecordImpl(new NoneAttestationStatement(), true, false, false,
                registered.getCounter(), readBack, null, null, null, null);

        byte[] challenge = challenges.issue();
        assertThatCode(() -> verify(record, SoftwareAuthenticator.authenticate(passkey, ceremony(challenge)), challenge))
                .doesNotThrowAnyException();
    }

    @Test
    void aRegistrationWithoutUserVerificationIsRejectedWhenItIsRequired() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        byte[] challenge = challenges.issue();
        Attestation attestation = SoftwareAuthenticator.register(passkey, ceremony(challenge).withFlags(FLAG_UP));

        assertThatThrownBy(() -> manager.verify(
                new RegistrationRequest(attestation.attestationObject(), attestation.clientDataJson()),
                new RegistrationParameters(server(challenge), ES256_ONLY,
                        USER_VERIFICATION_REQUIRED, USER_PRESENCE_REQUIRED)))
                .isInstanceOf(UserNotVerifiedException.class);
    }

    @Test
    void anAssertionWithoutUserVerificationIsRejectedWhenItIsRequired() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] challenge = challenges.issue();
        Assertion withoutUv = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge).withFlags(FLAG_UP));

        assertThatThrownBy(() -> verify(record, withoutUv, challenge)).isInstanceOf(UserNotVerifiedException.class);
    }

    @Test
    void anAssertionWithATamperedSignatureIsRejected() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] challenge = challenges.issue();
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge));
        byte[] tampered = assertion.signature().clone();
        tampered[tampered.length - 1] ^= 0x01; // last byte of the DER "s" integer: still well-formed DER
        Assertion bad = new Assertion(assertion.credentialId(), assertion.authenticatorData(),
                assertion.clientDataJson(), tampered);

        assertThatThrownBy(() -> verify(record, bad, challenge)).isInstanceOf(BadSignatureException.class);
    }

    @Test
    void anAssertionForAnotherChallengeIsRejected() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] expected = challenges.issue();
        byte[] other = SoftwareAuthenticator.randomBytes(32);
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(other));

        assertThatThrownBy(() -> verify(record, assertion, expected)).isInstanceOf(BadChallengeException.class);
    }

    @Test
    void anAssertionFromAnotherOriginIsRejected() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] challenge = challenges.issue();
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey,
                ceremony(challenge).withOrigin("https://fichaje.example.attacker.test"));

        assertThatThrownBy(() -> verify(record, assertion, challenge)).isInstanceOf(BadOriginException.class);
    }

    @Test
    void anAssertionForAnotherRpIdIsRejected() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);

        byte[] challenge = challenges.issue();
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge).withRpId("attacker.test"));

        assertThatThrownBy(() -> verify(record, assertion, challenge)).isInstanceOf(BadRpIdException.class);
    }

    @Test
    void anAssertionSignedByAnotherCredentialsKeyIsRejected() {
        Credential victim = SoftwareAuthenticator.newCredential();
        Credential other = SoftwareAuthenticator.newCredential();
        CredentialRecord victimRecord = register(victim);
        register(other);

        byte[] challenge = challenges.issue();
        Assertion forged = SoftwareAuthenticator.authenticateSignedBy(victim, other.keyPair(), ceremony(challenge));

        assertThatThrownBy(() -> verify(victimRecord, forged, challenge)).isInstanceOf(BadSignatureException.class);
    }

    @Test
    void aReplayedSyncedPasskeyAssertionIsStoppedOnlyByTheSingleUseChallenge() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);
        byte[] challenge = challenges.issue();
        Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge).withSignCount(0));

        assertThat(challenges.consume(challenge)).isTrue();
        assertThatCode(() -> verify(record, assertion, challenge)).doesNotThrowAnyException();

        // The server consumed the challenge on first use, so the replay is refused before any cryptography runs.
        assertThat(challenges.consume(challenge)).isFalse();
        // WebAuthn4J alone accepts the replay: the signature is still valid and a counter of 0 is never compared.
        // Single-use challenges are the server's job, not the library's.
        assertThatCode(() -> verify(record, assertion, challenge)).doesNotThrowAnyException();
    }

    @Test
    void aSignCountThatDoesNotGrowIsRejectedOnceTheServerStoresTheLastValue() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        CredentialRecord record = register(passkey);
        assertThat(record.getCounter()).isZero();

        byte[] first = challenges.issue();
        AuthenticationData data = verify(record,
                SoftwareAuthenticator.authenticate(passkey, ceremony(first).withSignCount(5)), first);
        record.setCounter(data.getAuthenticatorData().getSignCount()); // WebAuthn4J does not update the record
        assertThat(record.getCounter()).isEqualTo(5);

        for (long notGreater : new long[] {5, 4, 0}) {
            byte[] challenge = challenges.issue();
            Assertion assertion = SoftwareAuthenticator.authenticate(passkey, ceremony(challenge).withSignCount(notGreater));
            assertThatThrownBy(() -> verify(record, assertion, challenge))
                    .as("signCount %d after a stored 5", notGreater)
                    .isInstanceOf(MaliciousCounterValueException.class);
        }

        byte[] next = challenges.issue();
        assertThatCode(() -> verify(record,
                SoftwareAuthenticator.authenticate(passkey, ceremony(next).withSignCount(6)), next))
                .doesNotThrowAnyException();
    }

    @Test
    void aSyncedPasskeyThatAlwaysReportsZeroIsAcceptedEveryTime() {
        Credential passkey = SoftwareAuthenticator.newCredential();
        // A synced passkey is backup eligible from registration on; the record has to keep that flag, because
        // WebAuthn4J rejects an assertion whose BE flag differs from the stored one (BadBackupEligibleFlagException).
        CredentialRecord record = register(passkey, FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS);
        assertThat(record.isBackupEligible()).isTrue();

        for (int i = 0; i < 3; i++) {
            byte[] challenge = challenges.issue();
            Assertion assertion = SoftwareAuthenticator.authenticate(passkey,
                    ceremony(challenge).withFlags(FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS).withSignCount(0));
            AuthenticationData data = verify(record, assertion, challenge);
            record.setCounter(data.getAuthenticatorData().getSignCount());
            assertThat(data.getAuthenticatorData().isFlagBS()).isTrue();
        }
        assertThat(record.getCounter()).isZero();
    }

    private CredentialRecord register(Credential passkey) {
        return register(passkey, FLAG_UP | FLAG_UV);
    }

    private CredentialRecord register(Credential passkey, int flags) {
        byte[] challenge = challenges.issue();
        Attestation attestation = SoftwareAuthenticator.register(passkey, ceremony(challenge).withFlags(flags));
        RegistrationData data = manager.verify(
                new RegistrationRequest(attestation.attestationObject(), attestation.clientDataJson()),
                new RegistrationParameters(server(challenge), ES256_ONLY,
                        USER_VERIFICATION_REQUIRED, USER_PRESENCE_REQUIRED));
        return toRecord(data);
    }

    private static CredentialRecord toRecord(RegistrationData data) {
        return new CredentialRecordImpl(data.getAttestationObject(), data.getCollectedClientData(),
                data.getClientExtensions(), data.getTransports());
    }

    private AuthenticationData verify(CredentialRecord record, Assertion assertion, byte[] expectedChallenge) {
        return manager.verify(
                new AuthenticationRequest(assertion.credentialId(), assertion.authenticatorData(),
                        assertion.clientDataJson(), assertion.signature()),
                new AuthenticationParameters(server(expectedChallenge), record,
                        List.of(record.getAttestedCredentialData().getCredentialId()),
                        USER_VERIFICATION_REQUIRED, USER_PRESENCE_REQUIRED));
    }

    private static ServerProperty server(byte[] challenge) {
        return new ServerProperty(new Origin(ORIGIN), RP_ID, new DefaultChallenge(challenge));
    }

    private static Ceremony ceremony(byte[] challenge) {
        return Ceremony.of(RP_ID, ORIGIN, challenge);
    }

    /** Models the server: a challenge is issued once and the first verification attempt consumes it. */
    private static final class SingleUseChallenges {
        private final Set<String> issued = new HashSet<>();

        byte[] issue() {
            byte[] challenge = SoftwareAuthenticator.randomBytes(32);
            issued.add(base64Url(challenge));
            return challenge;
        }

        boolean consume(byte[] challenge) {
            return issued.remove(base64Url(challenge));
        }
    }
}
