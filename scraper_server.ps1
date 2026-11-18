$port = 5000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Local Scraper Bridge running on http://localhost:$port/ ..."

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    # CORS Headers
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        continue
    }

    $targetUrl = $request.QueryString["url"]

    if (-not $targetUrl) {
        $response.StatusCode = 400
        $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"error": "Missing url parameter"}')
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
        continue
    }

    try {
        $headers = @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            "Accept-Language" = "en-US,en;q=0.9"
        }

        $webRes = Invoke-WebRequest -Uri $targetUrl -Headers $headers -TimeoutSec 15 -UseBasicParsing
        $html = $webRes.Content

        # 1. Title
        $title = ""
        if ($html -match 'property="og:title"\s+content="([^"]+)"') { $title = $matches[1] }
        elseif ($html -match '<title>([^<]+)</title>') { $title = $matches[1] }
        $title = [System.Net.WebUtility]::HtmlDecode($title).Trim()

        # 2. Description
        $desc = ""
        if ($html -match 'property="og:description"\s+content="([^"]+)"') { $desc = $matches[1] }
        elseif ($html -match 'name="description"\s+content="([^"]+)"') { $desc = $matches[1] }
        $desc = [System.Net.WebUtility]::HtmlDecode($desc).Trim()

        # 3. Price
        $price = ""
        if ($html -match 'class="price"[^>]*>([^<]+)<') {
            $price = ($matches[1] -replace '[^0-9.]', '')
        } elseif ($html -match 'property="product:price:amount"\s+content="([^"]+)"') {
            $price = $matches[1]
        }

        # 4. Images
        $images = New-Object System.Collections.Generic.List[string]
        
        # Product catalog images (e.g. Magento / Naheed / Daraz)
        $imgMatches = [regex]::Matches($html, 'https://[^"\s]+\.(?:jpg|jpeg|png|webp)')
        foreach ($m in $imgMatches) {
            $imgUrl = $m.Value
            if ($imgUrl -match 'catalog/product' -or $imgUrl -match 'media/catalog' -or $imgUrl -match 'products/' -or $imgUrl -match 'images/') {
                if (-not ($imgUrl -match 'placeholder' -or $imgUrl -match 'logo' -or $imgUrl -match 'icon' -or $imgUrl -match 'banner' -or $imgUrl -match 'favicon')) {
                    if (-not $images.Contains($imgUrl)) {
                        $images.Add($imgUrl)
                    }
                }
            }
        }

        # Fallback to og:image if list empty
        if ($images.Count -eq 0 -and ($html -match 'property="og:image"\s+content="([^"]+)"')) {
            $ogImg = $matches[1]
            if (-not ($ogImg -match 'placeholder')) {
                $images.Add($ogImg)
            }
        }

        $resultObj = @{
            success = $true
            url = $targetUrl
            title = $title
            description = $desc
            price = $price
            images = $images
        }

        $jsonStr = $resultObj | ConvertTo-Json -Depth 5 -Compress
        $response.ContentType = "application/json; charset=utf-8"
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    catch {
        $errObj = @{
            success = $false
            error = $_.Exception.Message
        }
        $jsonStr = $errObj | ConvertTo-Json -Compress
        $response.ContentType = "application/json; charset=utf-8"
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }

    $response.Close()
}
