export class GeospatialFuzzingUtil {
  /**
   * Arredonda (trunca) a coordenada para 2 casas decimais.
   * 2 casas decimais fornecem precisão de ~1.1km na linha do equador.
   * Isso é suficiente para buscas de "profissionais próximos" mas
   * insuficiente para descobrir a casa exata do cliente.
   */
  public static fuzzCoordinate(coord: number | string | null | undefined): number | null {
    if (coord === null || coord === undefined) return null;
    const num = typeof coord === 'string' ? parseFloat(coord) : coord;
    if (isNaN(num)) return null;
    // Math.round para arredondar, ou Math.floor para truncar. Round é um pouco melhor pra busca centrada.
    return Math.round(num * 100) / 100;
  }
}
