param(
    [string]$Model = 'deepseek-v4-flash',
    [string]$BaseUrl = $(if ($env:LITELLM_BASE_URL) { $env:LITELLM_BASE_URL } else { 'http://localhost:4000/v1' })
)

$secureKey = Read-Host 'LiteLLM virtual key (input is hidden)' -AsSecureString
if ($secureKey.Length -eq 0) {
    throw 'No LiteLLM virtual key was entered.'
}

$apiKey = [System.Net.NetworkCredential]::new('', $secureKey).Password
if ($apiKey -notmatch '^sk-.+') {
    $apiKey = $null
    throw 'That does not look like a LiteLLM virtual key. Create one in the LiteLLM Virtual Keys page.'
}

$headers = @{ Authorization = "Bearer $apiKey" }
$payload = @{
    model = $Model
    messages = @(
        @{ role = 'user'; content = 'Reply with OK.' }
    )
} | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$($BaseUrl.TrimEnd('/'))/chat/completions" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body $payload

    Write-Output $response.choices[0].message.content
    Write-Output "Tokens used: $($response.usage.total_tokens)"
}
catch {
    Write-Error "LiteLLM request failed: $($_.Exception.Message)"
}
finally {
    $apiKey = $null
    $headers = $null
    $secureKey.Dispose()
}
