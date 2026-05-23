def test_package_imports():
    import pumptank_pipeline  # noqa: F401
    from pumptank_pipeline import config
    assert config.MAX_NULL_GOT_DEAL == 10
