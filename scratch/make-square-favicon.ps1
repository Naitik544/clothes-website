[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

$srcPath = "C:\Users\NAITIK\Desktop\clothes-website\public\images\logo-new.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = "C:\Users\NAITIK\.gemini\antigravity\scratch\little-to-large\public\images\logo-new.png"
}

Write-Host "Source image path: $srcPath"

# Load original image
$srcImg = [System.Drawing.Image]::FromFile($srcPath)
$srcWidth = $srcImg.Width
$srcHeight = $srcImg.Height

Write-Host "Original dimensions: $srcWidth x $srcHeight"

# Create a new square bitmap (512x512)
$squareSize = 512
$newBmp = New-Object System.Drawing.Bitmap($squareSize, $squareSize)
$g = [System.Drawing.Graphics]::FromImage($newBmp)

# Set high-quality rendering options
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# Clear background with transparency
$g.Clear([System.Drawing.Color]::Transparent)

# Calculate centered bounding box for the logo while keeping aspect ratio
# We want the logo to take up about 90% of the square space to look nice
$scale = ($squareSize * 0.9) / [Math]::Max($srcWidth, $srcHeight)
$destWidth = [int]($srcWidth * $scale)
$destHeight = [int]($srcHeight * $scale)

$destX = [int](($squareSize - $destWidth) / 2)
$destY = [int](($squareSize - $destHeight) / 2)

Write-Host "Drawing logo at ($destX, $destY) with size $destWidth x $destHeight"

# Draw the original image onto the square canvas
$g.DrawImage($srcImg, $destX, $destY, $destWidth, $destHeight)

# Dispose graphics context
$g.Dispose()
$srcImg.Dispose()

# Paths to save
$destPngPath1 = "C:\Users\NAITIK\.gemini\antigravity\scratch\little-to-large\public\favicon.png"
$destPngPath2 = "C:\Users\NAITIK\.gemini\antigravity\scratch\little-to-large\public\images\favicon.png"
$destIcoPath = "C:\Users\NAITIK\.gemini\antigravity\scratch\little-to-large\public\favicon.ico"

# Save as PNG
$newBmp.Save($destPngPath1, [System.Drawing.Imaging.ImageFormat]::Png)
$newBmp.Save($destPngPath2, [System.Drawing.Imaging.ImageFormat]::Png)

# Save as ICO (For ICO, we can just save it as PNG format but name it .ico, modern browsers/search engines support this,
# or we can save it as Icon. To be 100% safe, we save it as PNG)
$newBmp.Save($destIcoPath, [System.Drawing.Imaging.ImageFormat]::Png)

$newBmp.Dispose()

Write-Host "Successfully generated square favicons!"
