from middleware.rate_limiter import (
  GENERAL_BURST,
  MEDIA_BURST,
  IpRateLimiter,
)


def test_general_burst_blocks_ip():
    limiter = IpRateLimiter()
    for _ in range(GENERAL_BURST):
        assert limiter.is_allowed("1.2.3.4", bucket="general")[0] is True

    # Next request within the same second trips burst and bans.
    allowed, _, retry_after = limiter.is_allowed("1.2.3.4", bucket="general")
    assert allowed is False
    assert retry_after >= 60


def test_media_burst_is_higher_and_soft_rejects():
    limiter = IpRateLimiter()
    for _ in range(MEDIA_BURST):
        assert limiter.is_allowed("5.6.7.8", bucket="media")[0] is True

    allowed, detail, retry_after = limiter.is_allowed("5.6.7.8", bucket="media")
    assert allowed is False
    assert "media" in detail.lower()
    assert retry_after == 2
    # Soft reject must not put the IP on the long block list.
    assert "5.6.7.8" not in limiter.blocked_ips


def test_media_and_general_buckets_are_independent():
    limiter = IpRateLimiter()
    for _ in range(MEDIA_BURST):
        assert limiter.is_allowed("9.9.9.9", bucket="media")[0] is True

    # General bucket still has its own allowance.
    assert limiter.is_allowed("9.9.9.9", bucket="general")[0] is True


def test_fifty_media_uploads_fit_under_burst():
    """50 files + 50 optimize was the old ceiling; 30+30 still fits MEDIA_BURST."""
    limiter = IpRateLimiter()
    for _ in range(60):
        allowed, _, _ = limiter.is_allowed("10.0.0.1", bucket="media")
        assert allowed is True
