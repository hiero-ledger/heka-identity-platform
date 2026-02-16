export class GetDidMethodsResponseDto {
  public methods!: Array<string>

  public constructor(methods: Array<string>) {
    this.methods = methods
  }
}
