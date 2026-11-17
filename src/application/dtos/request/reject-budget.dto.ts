import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectBudgetRequestDto {
  @ApiPropertyOptional({ example: 'Valor acima do esperado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
