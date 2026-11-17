# Windows publisher signing

In plain language: Windows needs a verified name behind the app. A certificate
provider checks the publisher's identity and issues a signing identity, usually
through a paid service. The publisher completes that verification directly;
the build tools then use the identity to sign each release. No purchase, account
creation, identity submission or Windows security setting change has been made
as part of this setup. Until that verification is complete, the standalone app
remains unsigned and blocked on this device.

The standalone `Time Tracker.exe` built on November 17 was unsigned.
Windows Smart App Control blocks an unknown app when it cannot establish trust
and the executable has no trusted signature. The earlier capture/UI checks ran
through the development Electron executable and did not establish trust for the
standalone app. The existing unsigned portable app remains blocked on this PC.

The supported release fix is to sign the Windows binaries using a code-signing
identity issued by a trusted provider. A self-signed certificate does not provide
public trust for Smart App Control. Keep Windows security enabled.

Microsoft documents this behavior and signing requirements:

- [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)
- [Sign an app for Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)
- [Artifact Signing setup and eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)

First establish a signing identity. This requires the publisher's country and
whether the publisher is an individual or registered organization. Check the
provider's eligibility rules before buying a certificate or enabling a paid
service. As checked on November 17, Microsoft's Public Trust service accepts
individuals in the US and Canada and organizations in a specified list of
countries; India is not listed. Private Trust or Test profiles are not a
substitute for a Public Trust identity for distribution to ordinary Windows PCs.
The publisher must complete any identity verification directly with the provider.

Once the identity is issued, choose one configuration in the build terminal.
Do not put signing secrets in `.env.desktop`, commit them, or paste passwords
into chat. HSM/token/cloud providers can require their own client software.

For an existing exportable certificate permitted by the provider:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = 'C:\Signing\publisher.pfx'
# Supply WINDOWS_CERTIFICATE_PASSWORD through your secret manager or protected
# terminal environment. Never put its literal value in a script or commit.
npm run build:portable-win
```

For an identity available through the Windows certificate store or a provider's
HSM client, set `WINDOWS_SIGN_WITH_PARAMS` to the provider's SignTool parameters.
For example, select a specific installed certificate by its public thumbprint:

```powershell
$env:WINDOWS_SIGN_WITH_PARAMS = '/sha1 YOUR_CERTIFICATE_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256'
npm run build:portable-win
```

For a cloud signing integration, set `WINDOWS_SIGN_HOOK_MODULE_PATH` to an absolute
path outside the packaged app. The module must export an async function accepting
the path of one binary, sign that file in place, and throw on failure. Supply the
provider's authentication through its supported credential mechanism. The app's
build allowlist excludes the signing hook and signing secrets from distribution.

The release build signs Windows PE binaries, including native `.node` modules,
and verifies their Authenticode signatures using Windows. It fails before
packaging if no signing identity is configured. It reports success only after
every packaged Windows binary verifies as trusted. Signing and verification have
not been completed here because no signing identity is currently available.

To verify an existing release independently:

```powershell
node scripts/verify-windows-signatures.js 'portable-dist\Time Tracker-win32-x64'
```

`npm run build:portable-win:dev` explicitly produces an **unsigned development
build** under `portable-dev-dist`, separate from the release location used by
the launchers. Windows may block that development build. Renaming/rebuilding an
unsigned executable or removing its downloaded-file marker does not establish
publisher trust. A valid signature also does not guarantee universal acceptance:
test the completed release on the target PC under its actual security policies.

The signing setup has been checked with 16 passing regression tests and targeted
lint. Microsoft's signed SignTool correctly rejected the existing unsigned EXE
and unsigned bundled native components. Successful signing with a real trusted
identity remains untested until that identity is provided.
