#[tokio::main]
async fn main() -> anyhow::Result<()> {
    simpanman_lib::run().await
}
